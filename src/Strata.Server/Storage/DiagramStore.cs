using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;

namespace Strata.Server.Storage;

public class DiagramStore(StrataDbContext db)
{
    public static string NewToken() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));

    public static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public Task<List<DiagramSummary>> ListAsync(CancellationToken ct) =>
        db.Diagrams.OrderByDescending(d => d.UpdatedAt)
            .Select(d => new DiagramSummary(d.Id, d.Name, d.UpdatedAt))
            .ToListAsync(ct);

    public Task<Diagram?> GetAsync(string id, CancellationToken ct) =>
        db.Diagrams.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);

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
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Diagrams.Add(diagram);
        await db.SaveChangesAsync(ct);
        return diagram;
    }

    public async Task<Diagram?> SaveAsync(string id, string name, string data, CancellationToken ct)
    {
        var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (diagram is null) return null;
        diagram.Name = name;
        diagram.Data = data;
        diagram.UpdatedAt = Now();
        await db.SaveChangesAsync(ct);
        return diagram;
    }

    public async Task<string?> RotateTokenAsync(string id, CancellationToken ct)
    {
        var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (diagram is null) return null;
        diagram.ViewToken = NewToken();
        await db.SaveChangesAsync(ct);
        return diagram.ViewToken;
    }

    public async Task<bool> RemoveAsync(string id, CancellationToken ct) =>
        await db.Diagrams.Where(d => d.Id == id).ExecuteDeleteAsync(ct) > 0;

    public static JsonElement ParseData(string data) => JsonSerializer.Deserialize<JsonElement>(data);

    public static DiagramResponse ToResponse(Diagram d) =>
        new(d.Id, d.ViewToken, d.Name, ParseData(d.Data), d.CreatedAt, d.UpdatedAt);
}
