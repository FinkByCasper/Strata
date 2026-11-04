using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Auth;

namespace Strata.Server.Storage;

public class VersionStore(StrataDbContext db, Actor actor, HistorySettings settings)
{
    private sealed record Counts(int Nodes, int Connectors, int Zones);

    public static string Hash(string name, string data) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(name + "\n" + data)));

    public async Task CaptureBeforeOverwriteAsync(Diagram previous, string newName, string newData, CancellationToken ct)
    {
        if (settings.MaxAutomatic == 0 || (previous.Name == newName && previous.Data == newData)) return;

        var hash = Hash(previous.Name, previous.Data);
        var latest = await db.Versions.Where(v => v.DiagramId == previous.Id)
            .OrderByDescending(v => v.CreatedAt)
            .Select(v => new { v.CreatedAt, v.ContentHash })
            .FirstOrDefaultAsync(ct);
        var now = DiagramStore.Now();
        if (latest is not null && (latest.ContentHash == hash || now - latest.CreatedAt < settings.Interval.TotalMilliseconds)) return;

        var counts = Count(previous.Data);
        if (counts.Nodes + counts.Zones == 0) return;
        db.Versions.Add(Snapshot(previous, VersionKind.Auto, null, previous.UpdatedById, previous.UpdatedAt, now, hash, counts));
    }

    public async Task PruneAsync(string diagramId, CancellationToken ct)
    {
        if (settings.MaxAutomatic == 0) return;
        var surplus = await db.Versions
            .Where(v => v.DiagramId == diagramId && v.Kind != VersionKind.Manual)
            .OrderByDescending(v => v.SavedAt).ThenByDescending(v => v.CreatedAt)
            .Skip(settings.MaxAutomatic)
            .Select(v => v.Id)
            .ToListAsync(ct);
        if (surplus.Count > 0) await db.Versions.Where(v => surplus.Contains(v.Id)).ExecuteDeleteAsync(ct);
    }

    public async Task<List<VersionSummary>> ListAsync(string diagramId, CancellationToken ct) =>
        await (from v in db.Versions
               where v.DiagramId == diagramId
               join u in db.Users on v.AuthorId equals u.Id into authors
               from author in authors.DefaultIfEmpty()
               orderby v.SavedAt descending, v.CreatedAt descending
               select new VersionSummary(v.Id, v.SavedAt, v.Kind, v.Label, author.DisplayName, v.Name, v.NodeCount, v.ConnectorCount, v.ZoneCount))
            .ToListAsync(ct);

    public Task<DiagramVersion?> GetAsync(string diagramId, string versionId, CancellationToken ct) =>
        db.Versions.FirstOrDefaultAsync(v => v.DiagramId == diagramId && v.Id == versionId, ct);

    public async Task<VersionSummary> CreateManualAsync(Diagram diagram, string? label, CancellationToken ct)
    {
        var now = DiagramStore.Now();
        var version = Snapshot(diagram, VersionKind.Manual, label, actor.UserId, now, now, Hash(diagram.Name, diagram.Data), Count(diagram.Data));
        db.Versions.Add(version);
        await db.SaveChangesAsync(ct);
        return (await ListAsync(diagram.Id, ct)).First(v => v.Id == version.Id);
    }

    public async Task RestoreAsync(Diagram diagram, DiagramVersion version, CancellationToken ct)
    {
        var now = DiagramStore.Now();
        db.Versions.Add(Snapshot(diagram, VersionKind.Restore, null, diagram.UpdatedById, diagram.UpdatedAt, now, Hash(diagram.Name, diagram.Data), Count(diagram.Data)));
        diagram.Name = version.Name;
        diagram.Data = version.Data;
        diagram.UpdatedAt = now;
        diagram.UpdatedById = actor.UserId;
        await db.SaveChangesAsync(ct);
        await PruneAsync(diagram.Id, ct);
    }

    public async Task<bool> DeleteAsync(string diagramId, string versionId, CancellationToken ct) =>
        await db.Versions.Where(v => v.DiagramId == diagramId && v.Id == versionId).ExecuteDeleteAsync(ct) > 0;

    public static VersionResponse ToResponse(VersionSummary summary, DiagramVersion version) =>
        new(summary.Id, summary.SavedAt, summary.Kind, summary.Label, summary.AuthorName, summary.Name, summary.Nodes, summary.Connectors, summary.Zones, DiagramStore.ParseData(version.Data));

    private static DiagramVersion Snapshot(Diagram source, VersionKind kind, string? label, string? authorId, long savedAt, long createdAt, string hash, Counts counts) => new()
    {
        Id = Guid.NewGuid().ToString(),
        DiagramId = source.Id,
        AuthorId = authorId,
        Name = source.Name,
        Data = source.Data,
        Kind = kind,
        Label = label,
        ContentHash = hash,
        NodeCount = counts.Nodes,
        ConnectorCount = counts.Connectors,
        ZoneCount = counts.Zones,
        SavedAt = savedAt,
        CreatedAt = createdAt,
    };

    private static Counts Count(string data)
    {
        using var doc = JsonDocument.Parse(data);
        int Length(string name) => doc.RootElement.TryGetProperty(name, out var list) && list.ValueKind == JsonValueKind.Array ? list.GetArrayLength() : 0;
        return new Counts(Length("nodes"), Length("connectors"), Length("zones"));
    }
}
