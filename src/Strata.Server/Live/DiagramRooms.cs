using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Auth;
using Strata.Server.Storage;

namespace Strata.Server.Live;

public sealed record OpsMessage(long Rev, string From, string Batch, IReadOnlyList<LiveOp> Ops);

public sealed record ResetMessage(long Rev, string Name, JsonElement Data);

public sealed class DiagramRooms(IServiceScopeFactory scopes, IHubContext<DiagramHub> hub, LiveSettings settings, AuthSettings auth, ILogger<DiagramRooms> log) : IHostedService
{
    private static readonly string[] Palette = ["#ef5b7b", "#4f8cff", "#22b8a6", "#f5a524", "#8b6cf6", "#e879f9", "#84cc16", "#06b6d4"];

    private sealed class Room(string id, DiagramDoc doc, long rev)
    {
        public string Id { get; } = id;
        public SemaphoreSlim Gate { get; } = new(1, 1);
        public DiagramDoc Doc { get; set; } = doc;
        public long Rev { get; set; } = rev;
        public Dictionary<string, Peer> Members { get; } = [];
        public int Joined { get; set; }
        public int Guests { get; set; }
        public bool Dirty { get; set; }
        public string? LastEditor { get; set; }
        public Timer? SaveTimer { get; set; }
        public bool Closed { get; set; }
        public TaskCompletionSource Finished { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public string Group => GroupName(Id);
    }

    private readonly ConcurrentDictionary<string, Lazy<Task<Room>>> rooms = new();
    private readonly ConcurrentDictionary<string, string> connections = new();

    private static string GroupName(string diagramId) => $"d:{diagramId}";

    public async Task<JoinResult> JoinAsync(string diagramId, string connectionId, string? userId, string? displayName, AccessLevel level)
    {
        while (true)
        {
            var room = await RoomAsync(diagramId);
            Task? retireWait = null;

            await room.Gate.WaitAsync();
            try
            {
                if (room.Closed)
                {
                    retireWait = room.Finished.Task;
                }
                else
                {
                    room.Joined++;
                    var name = displayName ?? $"Guest {++room.Guests}";
                    var color = Palette.FirstOrDefault(c => room.Members.Values.All(m => m.Color != c)) ?? Palette[room.Joined % Palette.Length];
                    var you = new Peer(connectionId, userId, name, color, level >= AccessLevel.Editor);
                    var others = room.Members.Values.ToList();
                    room.Members[connectionId] = you;
                    connections[connectionId] = diagramId;
                    await hub.Groups.AddToGroupAsync(connectionId, room.Group);
                    await hub.Clients.GroupExcept(room.Group, [connectionId]).SendAsync("PeerJoined", you);
                    return new JoinResult(room.Rev, room.Doc.Name, room.Doc.ToElement(), level.ToString().ToLowerInvariant(), you, others);
                }
            }
            finally
            {
                room.Gate.Release();
            }

            await retireWait;
        }
    }

    public async Task<long> ApplyAsync(string connectionId, string batch, IReadOnlyList<LiveOp> ops)
    {
        var room = await MemberRoomAsync(connectionId);
        await room.Gate.WaitAsync();
        try
        {
            if (room.Closed || !room.Members.TryGetValue(connectionId, out var member)) throw new HubException("you are no longer in this diagram");
            if (!member.CanEdit) throw new HubException("read-only access");
            if (ops.Count > LiveSettings.MaxOpsPerBatch) throw new HubException("too many changes at once");

            var (problem, accepted) = room.Doc.Apply(ops);
            if (problem is not null) throw new HubException(problem);
            if (accepted.Count == 0) return room.Rev;

            room.Rev++;
            room.Dirty = true;
            room.LastEditor = member.UserId;
            ScheduleSave(room);
            await hub.Clients.Group(room.Group).SendAsync("Ops", new OpsMessage(room.Rev, connectionId, batch, accepted));
            return room.Rev;
        }
        finally
        {
            room.Gate.Release();
        }
    }

    public Task CursorAsync(string connectionId, double? x, double? z) =>
        connections.TryGetValue(connectionId, out var diagramId)
            ? hub.Clients.GroupExcept(GroupName(diagramId), [connectionId]).SendAsync("Cursor", connectionId, x, z)
            : Task.CompletedTask;

    public async Task LeaveAsync(string connectionId)
    {
        if (!connections.TryRemove(connectionId, out var diagramId) || !rooms.TryGetValue(diagramId, out var lazy)) return;
        var room = await lazy.Value;
        var empty = false;

        await room.Gate.WaitAsync();
        try
        {
            if (!room.Members.Remove(connectionId)) return;
            await hub.Groups.RemoveFromGroupAsync(connectionId, room.Group);
            await hub.Clients.Group(room.Group).SendAsync("PeerLeft", connectionId);
            if (room.Members.Count == 0 && !room.Closed)
            {
                room.Closed = true;
                empty = true;
            }
        }
        finally
        {
            room.Gate.Release();
        }

        if (!empty) return;
        try { await SaveAsync(room); }
        finally { Retire(room); }
    }

    public async Task ReloadAsync(string diagramId)
    {
        if (!rooms.TryGetValue(diagramId, out var lazy)) return;
        var room = await lazy.Value;
        var stored = await ReadAsync(diagramId);

        await room.Gate.WaitAsync();
        try
        {
            if (room.Closed) return;
            if (stored is null)
            {
                await CloseLockedAsync(room);
                return;
            }
            room.Doc = DiagramDoc.Parse(stored.Value.Name, stored.Value.Data);
            room.Rev++;
            room.Dirty = false;
            room.SaveTimer?.Dispose();
            room.SaveTimer = null;
            await hub.Clients.Group(room.Group).SendAsync("Reset", new ResetMessage(room.Rev, room.Doc.Name, room.Doc.ToElement()));
        }
        finally
        {
            room.Gate.Release();
        }
    }

    public async Task CloseAsync(string diagramId)
    {
        if (!rooms.TryGetValue(diagramId, out var lazy)) return;
        var room = await lazy.Value;
        await room.Gate.WaitAsync();
        try { await CloseLockedAsync(room); }
        finally { room.Gate.Release(); }
    }

    public async Task KickAsync(string diagramId, string userId)
    {
        if (!rooms.TryGetValue(diagramId, out var lazy)) return;
        var room = await lazy.Value;
        await room.Gate.WaitAsync();
        try
        {
            foreach (var member in room.Members.Values.Where(m => m.UserId == userId).ToList())
            {
                room.Members.Remove(member.ConnectionId);
                connections.TryRemove(member.ConnectionId, out _);
                await hub.Clients.Client(member.ConnectionId).SendAsync("Kicked");
                await hub.Groups.RemoveFromGroupAsync(member.ConnectionId, room.Group);
                await hub.Clients.Group(room.Group).SendAsync("PeerLeft", member.ConnectionId);
            }
        }
        finally
        {
            room.Gate.Release();
        }
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var lazy in rooms.Values.Where(l => l.IsValueCreated).ToList())
            await SaveAsync(await lazy.Value);
    }

    private async Task CloseLockedAsync(Room room)
    {
        if (room.Closed) return;
        room.Closed = true;
        room.Dirty = false;
        room.SaveTimer?.Dispose();
        room.SaveTimer = null;
        await hub.Clients.Group(room.Group).SendAsync("Closed");
        foreach (var member in room.Members.Values)
        {
            connections.TryRemove(member.ConnectionId, out _);
            await hub.Groups.RemoveFromGroupAsync(member.ConnectionId, room.Group);
        }
        room.Members.Clear();
        Retire(room);
    }

    private void Retire(Room room)
    {
        rooms.TryRemove(room.Id, out _);
        room.Finished.TrySetResult();
    }

    private async Task<Room> MemberRoomAsync(string connectionId)
    {
        if (!connections.TryGetValue(connectionId, out var diagramId) || !rooms.TryGetValue(diagramId, out var lazy))
            throw new HubException("join a diagram first");
        return await lazy.Value;
    }

    private async Task<Room> RoomAsync(string diagramId)
    {
        var lazy = rooms.GetOrAdd(diagramId, id => new Lazy<Task<Room>>(() => LoadAsync(id)));
        try
        {
            return await lazy.Value;
        }
        catch
        {
            rooms.TryRemove(new KeyValuePair<string, Lazy<Task<Room>>>(diagramId, lazy));
            throw;
        }
    }

    private async Task<Room> LoadAsync(string diagramId)
    {
        var stored = await ReadAsync(diagramId) ?? throw new HubException("not found");
        return new Room(diagramId, DiagramDoc.Parse(stored.Name, stored.Data), 0);
    }

    private async Task<(string Name, string Data)?> ReadAsync(string diagramId)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
        var row = await db.Diagrams.AsNoTracking().Where(d => d.Id == diagramId).Select(d => new { d.Name, d.Data }).FirstOrDefaultAsync();
        return row is null ? null : (row.Name, row.Data);
    }

    private void ScheduleSave(Room room) =>
        room.SaveTimer ??= new Timer(_ => _ = SaveAsync(room), null, settings.SaveDelay, Timeout.InfiniteTimeSpan);

    private async Task SaveAsync(Room room)
    {
        string name, data;
        string? editor;
        await room.Gate.WaitAsync();
        try
        {
            room.SaveTimer?.Dispose();
            room.SaveTimer = null;
            if (!room.Dirty) return;
            name = room.Doc.Name;
            data = room.Doc.ToJson();
            editor = room.LastEditor;
            room.Dirty = false;
        }
        finally
        {
            room.Gate.Release();
        }

        try
        {
            await using var scope = scopes.CreateAsyncScope();
            scope.ServiceProvider.GetRequiredService<ActorOverride>().Value = new Actor(editor, auth.Enabled);
            var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
            var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == room.Id);
            if (diagram is null) return;
            await scope.ServiceProvider.GetRequiredService<DiagramStore>().SaveAsync(diagram, name, data, CancellationToken.None);
        }
        catch (Exception e)
        {
            log.LogError(e, "Could not save diagram {Id}; will retry", room.Id);
            await room.Gate.WaitAsync();
            try
            {
                room.Dirty = true;
                if (!room.Closed) room.SaveTimer ??= new Timer(_ => _ = SaveAsync(room), null, TimeSpan.FromSeconds(5), Timeout.InfiniteTimeSpan);
            }
            finally
            {
                room.Gate.Release();
            }
        }
    }
}
