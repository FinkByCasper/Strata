using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Strata.Server.Auth;
using Strata.Server.Storage;

namespace Strata.Server.Live;

/// <summary>
/// Real-time editing, mounted at <c>/hubs/diagram</c> (SignalR, JSON protocol). A client calls <c>Join</c> once, then <c>Apply</c> for each batch of
/// local changes and <c>Cursor</c> as the pointer moves. The server pushes: <c>Ops</c> (every accepted batch, the sender's own included, in one
/// order for everybody), <c>Reset</c> (the whole diagram was replaced, e.g. by a version restore), <c>PeerJoined</c>, <c>PeerLeft</c>,
/// <c>Cursor</c>, <c>Kicked</c> (access was withdrawn) and <c>Closed</c> (the diagram was deleted). Failures arrive as a <see cref="HubException"/> whose
/// message is safe to show; after one, call <c>Join</c> again to resynchronise. The server saves the diagram to the database a moment after changes.
/// </summary>
public sealed class DiagramHub(DiagramRooms rooms, IServiceProvider services, AuthSettings auth) : Hub
{
    private DateTimeOffset lastCursor;

    /// <summary>Opens a diagram for live editing. Needs at least viewer access. Leaves any diagram this connection had open.</summary>
    /// <param name="diagramId">The diagram's editing id.</param>
    public async Task<JoinResult> Join(string diagramId)
    {
        await rooms.LeaveAsync(Context.ConnectionId);
        var actor = Actor.From(Context.GetHttpContext(), auth);
        services.GetRequiredService<ActorOverride>().Value = actor;
        var store = services.GetRequiredService<DiagramStore>();
        var access = await store.FindAsync(diagramId, Context.ConnectionAborted) ?? throw new HubException("not found");
        var name = auth.Enabled ? Context.User?.FindFirstValue(ClaimTypes.Name) : null;
        return await rooms.JoinAsync(diagramId, Context.ConnectionId, actor.UserId, name, access.Level);
    }

    /// <summary>Submits a batch of changes. The batch is applied completely or not at all.</summary>
    /// <param name="batch">An id chosen by the caller and returned with the matching <c>Ops</c> message, so the caller can tell its own batch from others.</param>
    /// <param name="ops">At most 500 operations.</param>
    /// <returns>The room's revision after the batch.</returns>
    public Task<long> Apply(string batch, List<LiveOp> ops) => rooms.ApplyAsync(Context.ConnectionId, batch, ops);

    /// <summary>Shares the pointer position on the floor, in grid units. Null hides it. Sent to everyone else in the room.</summary>
    public Task Cursor(double? x, double? z)
    {
        var now = DateTimeOffset.UtcNow;
        if (now - lastCursor < TimeSpan.FromMilliseconds(30)) return Task.CompletedTask;
        lastCursor = now;
        return rooms.CursorAsync(Context.ConnectionId, x is { } a && double.IsFinite(a) ? a : null, z is { } b && double.IsFinite(b) ? b : null);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await rooms.LeaveAsync(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
