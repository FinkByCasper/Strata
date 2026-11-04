using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Auth;
using Strata.Server.Validation;

namespace Strata.Server.Storage;

public partial class DiagramTransfer(StrataDbContext db, Actor actor)
{
    public async Task<ExportFile> ExportAsync(CancellationToken ct)
    {
        var mine = actor.Enforced ? db.Diagrams.Where(d => d.OwnerId == actor.UserId && actor.UserId != null) : db.Diagrams;
        var rows = await mine.AsNoTracking().OrderBy(d => d.CreatedAt).ToListAsync(ct);
        var items = rows
            .Select(d => new ExportedDiagram(d.Id, d.ViewToken, d.Name, DiagramStore.ParseData(d.Data), d.CreatedAt, d.UpdatedAt))
            .ToList();
        return new ExportFile("strata-export", 1, DiagramStore.Now(), items);
    }

    public Task<ImportResult> ImportAsync(IEnumerable<ExportedDiagram> items, bool overwrite, CancellationToken ct) =>
        ImportAsync(items, overwrite, actor.UserId, actor.Enforced, ct);

    public async Task<ImportResult> ImportAsync(IEnumerable<ExportedDiagram> items, bool overwrite, string? ownerId, bool ownedOnly, CancellationToken ct)
    {
        int imported = 0, replaced = 0, skipped = 0;
        var rejected = new List<RejectedDiagram>();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        foreach (var item in items)
        {
            if (Check(item) is { } error)
            {
                rejected.Add(new RejectedDiagram(item.Id, item.Name, error));
                continue;
            }

            var now = DiagramStore.Now();
            var existing = await db.Diagrams.FirstOrDefaultAsync(d => d.Id == item.Id, ct);
            if (existing is not null)
            {
                if (ownedOnly && existing.OwnerId != ownerId)
                {
                    rejected.Add(new RejectedDiagram(item.Id, item.Name, "id belongs to another account"));
                    continue;
                }
                if (!overwrite) { skipped++; continue; }
                existing.Name = item.Name;
                existing.Data = item.Data.GetRawText();
                existing.UpdatedAt = item.UpdatedAt ?? now;
                replaced++;
            }
            else
            {
                db.Diagrams.Add(new Diagram
                {
                    Id = item.Id,
                    ViewToken = await UsableTokenAsync(item.ViewToken, ct),
                    Name = item.Name,
                    Data = item.Data.GetRawText(),
                    OwnerId = ownerId,
                    UpdatedById = ownerId,
                    CreatedAt = item.CreatedAt ?? now,
                    UpdatedAt = item.UpdatedAt ?? now,
                });
                imported++;
            }
            await db.SaveChangesAsync(ct);
        }
        await tx.CommitAsync(ct);
        return new ImportResult(imported, replaced, skipped, rejected);
    }

    private static string? Check(ExportedDiagram item)
    {
        if (item.Id is null || !IdPattern().IsMatch(item.Id)) return "bad id";
        if (item.Name is null || item.Name.Length > 200) return "bad name";
        return DiagramValidator.Validate(item.Data);
    }

    private async Task<string> UsableTokenAsync(string? offered, CancellationToken ct)
    {
        var tracked = db.ChangeTracker.Entries<Diagram>().Any(e => e.Entity.ViewToken == offered);
        if (offered is not null && TokenPattern().IsMatch(offered) && !tracked && !await db.Diagrams.AnyAsync(d => d.ViewToken == offered, ct))
            return offered;
        return DiagramStore.NewToken();
    }

    [GeneratedRegex(@"^[A-Za-z0-9_-]{1,64}$")]
    private static partial Regex IdPattern();

    [GeneratedRegex(@"^[A-Za-z0-9_-]{16,32}$")]
    private static partial Regex TokenPattern();
}
