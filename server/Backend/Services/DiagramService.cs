using System.Buffers.Text;
using System.Security.Cryptography;
using Domain.Entities;
using Domain.Models;
using Microsoft.EntityFrameworkCore;
using Services.Data;

namespace Services;

public class DiagramService(StrataDbContext db) : IDiagramService
{
    private static string NewToken()
    {
        return Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(16));
    }

    private static long Now()
    {
        return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public async Task<List<DiagramSummary>> ListAsync(CancellationToken ct = default)
    {
        return await db.Diagrams
            .AsNoTracking()
            .OrderByDescending(d => d.UpdatedAt)
            .Select(d => new DiagramSummary(d.Id, d.Name, d.UpdatedAt))
            .ToListAsync(ct);
    }

    public async Task<Diagram?> GetAsync(string id, CancellationToken ct = default)
    {
        return await db.Diagrams.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
    }

    public async Task<Diagram?> GetByTokenAsync(string viewToken, CancellationToken ct = default)
    {
        return await db.Diagrams.AsNoTracking().FirstOrDefaultAsync(d => d.ViewToken == viewToken, ct);
    }

    public async Task<Diagram> CreateAsync(string name, DiagramData data, CancellationToken ct = default)
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

    public async Task<Diagram?> SaveAsync(string id, string name, DiagramData data, CancellationToken ct = default)
    {
        var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (diagram is null)
        {
            return null;
        }

        diagram.Name = name;
        diagram.Data = data;
        diagram.UpdatedAt = Now();
        await db.SaveChangesAsync(ct);
        return diagram;
    }

    public async Task<string?> RotateViewTokenAsync(string id, CancellationToken ct = default)
    {
        var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (diagram is null)
        {
            return null;
        }

        diagram.ViewToken = NewToken();
        await db.SaveChangesAsync(ct);
        return diagram.ViewToken;
    }

    public async Task<bool> DeleteAsync(string id, CancellationToken ct = default)
    {
        var diagram = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == id, ct);
        if (diagram is null)
        {
            return false;
        }

        db.Diagrams.Remove(diagram);
        await db.SaveChangesAsync(ct);
        return true;
    }
}
