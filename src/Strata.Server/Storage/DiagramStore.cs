using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Auth;

namespace Strata.Server.Storage;

public enum AccessLevel
{
    Viewer,
    Editor,
    Owner,
}

public sealed record Access(Diagram Diagram, AccessLevel Level)
{
    public string RoleName => Level.ToString().ToLowerInvariant();

    public Access Require(AccessLevel needed, string message)
    {
        if (Level < needed) throw new ApiException(403, message);
        return this;
    }
}

public class DiagramStore(StrataDbContext db, Actor actor, VersionStore versions)
{
    public static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));

    public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public async Task<List<DiagramSummary>> ListAsync(CancellationToken ct)
    {
        if (!actor.Enforced)
            return await db.Diagrams.OrderByDescending(d => d.UpdatedAt)
                .Select(d => new DiagramSummary(d.Id, d.Name, d.UpdatedAt, "owner", null))
                .ToListAsync(ct);

        var me = actor.UserId;
        if (me is null) return [];

        var own = await db.Diagrams.Where(d => d.OwnerId == me)
            .Select(d => new DiagramSummary(d.Id, d.Name, d.UpdatedAt, "owner", null))
            .ToListAsync(ct);
        var shared = await (
            from s in db.Shares
            where s.UserId == me
            join d in db.Diagrams on s.DiagramId equals d.Id
            join o in db.Users on d.OwnerId equals o.Id
            select new { d.Id, d.Name, d.UpdatedAt, s.Role, Owner = o.DisplayName }).ToListAsync(ct);

        return own
            .Concat(shared.Select(x => new DiagramSummary(x.Id, x.Name, x.UpdatedAt, x.Role.ToString().ToLowerInvariant(), x.Owner)))
            .OrderByDescending(d => d.UpdatedAt)
            .ToList();
    }

    public async Task<Access?> FindAsync(string id, CancellationToken ct)
    {
        var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (diagram is null) return null;
        if (!actor.Enforced) return new Access(diagram, AccessLevel.Owner);

        var me = actor.UserId;
        if (me is null) return null;
        if (diagram.OwnerId == me) return new Access(diagram, AccessLevel.Owner);

        var share = await db.Shares.Where(s => s.DiagramId == id && s.UserId == me).Select(s => (ShareRole?)s.Role).FirstOrDefaultAsync(ct);
        return share is { } role ? new Access(diagram, role == ShareRole.Editor ? AccessLevel.Editor : AccessLevel.Viewer) : null;
    }

    public Task<Diagram?> GetByTokenAsync(string token, CancellationToken ct) =>
        db.Diagrams.AsNoTracking().FirstOrDefaultAsync(d => d.ViewToken == token, ct);

    public async Task<Diagram> CreateAsync(string name, string data, CancellationToken ct)
    {
        var now = Now();
        var diagram = new Diagram
        {
            Id = Guid.NewGuid().ToString(),
            ViewToken = NewToken(),
            Name = name,
            Data = data,
            OwnerId = actor.UserId,
            UpdatedById = actor.UserId,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Diagrams.Add(diagram);
        await db.SaveChangesAsync(ct);
        return diagram;
    }

    public async Task SaveAsync(Diagram diagram, string name, string data, CancellationToken ct)
    {
        await versions.CaptureBeforeOverwriteAsync(diagram, name, data, ct);
        diagram.Name = name;
        diagram.Data = data;
        diagram.UpdatedAt = Now();
        diagram.UpdatedById = actor.UserId;
        await db.SaveChangesAsync(ct);
        await versions.PruneAsync(diagram.Id, ct);
    }

    public async Task<string> RotateTokenAsync(Diagram diagram, CancellationToken ct)
    {
        diagram.ViewToken = NewToken();
        await db.SaveChangesAsync(ct);
        return diagram.ViewToken;
    }

    public async Task RemoveAsync(Diagram diagram, CancellationToken ct)
    {
        db.Diagrams.Remove(diagram);
        await db.SaveChangesAsync(ct);
    }

    public async Task<List<ShareResponse>> SharesAsync(string diagramId, CancellationToken ct) =>
        await (from s in db.Shares
               where s.DiagramId == diagramId
               join u in db.Users on s.UserId equals u.Id
               orderby u.Email
               select new ShareResponse(u.Id, u.Email, u.DisplayName, s.Role)).ToListAsync(ct);

    public async Task<ShareResponse> ShareAsync(Diagram diagram, string? email, ShareRole role, CancellationToken ct)
    {
        var address = AccountService.NormalizeEmail(email);
        var target = await db.Users.FirstOrDefaultAsync(u => u.Email == address, ct) ?? throw new ApiException(404, "no account with that email");
        if (target.Id == diagram.OwnerId) throw new ApiException(400, "the owner already has full access");

        var existing = await db.Shares.FirstOrDefaultAsync(s => s.DiagramId == diagram.Id && s.UserId == target.Id, ct);
        if (existing is null)
            db.Shares.Add(new DiagramShare { DiagramId = diagram.Id, UserId = target.Id, Role = role, CreatedAt = Now() });
        else
            existing.Role = role;
        await db.SaveChangesAsync(ct);
        return new ShareResponse(target.Id, target.Email, target.DisplayName, role);
    }

    public async Task<bool> UnshareAsync(string diagramId, string userId, CancellationToken ct) =>
        await db.Shares.Where(s => s.DiagramId == diagramId && s.UserId == userId).ExecuteDeleteAsync(ct) > 0;

    public static JsonElement ParseData(string data) => JsonSerializer.Deserialize<JsonElement>(data);

    public static DiagramResponse ToResponse(Access access)
    {
        var d = access.Diagram;
        return new DiagramResponse(d.Id, access.Level == AccessLevel.Owner ? d.ViewToken : null, d.Name, ParseData(d.Data), d.CreatedAt, d.UpdatedAt, access.RoleName);
    }
}
