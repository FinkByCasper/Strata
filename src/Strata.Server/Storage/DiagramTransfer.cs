using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Auth;
using Strata.Server.Models;
using Strata.Server.Live;
using Strata.Server.Validation;

namespace Strata.Server.Storage;

public partial class DiagramTransfer(StrataDbContext db, Actor actor, ModelStore models, DiagramRooms rooms)
{
    public async Task<ExportFile> ExportAsync(CancellationToken ct)
    {
        var mine = actor.Enforced ? db.Diagrams.Where(d => d.OwnerId == actor.UserId && actor.UserId != null) : db.Diagrams;
        var rows = await mine.AsNoTracking().OrderBy(d => d.CreatedAt).ToListAsync(ct);
        var ids = rows.Select(d => d.Id).ToList();
        var files = (await db.Models.AsNoTracking().Where(m => ids.Contains(m.DiagramId)).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id).ToListAsync(ct))
            .ToLookup(m => m.DiagramId, m => new ExportedModel(m.Id, m.Name, Convert.ToBase64String(m.Data)));
        var items = rows
            .Select(d => new ExportedDiagram(d.Id, d.ViewToken, d.Name, DiagramStore.ParseData(d.Data), d.CreatedAt, d.UpdatedAt, files[d.Id].ToList()))
            .ToList();
        return new ExportFile("strata-export", 1, DiagramStore.Now(), items);
    }

    public Task<ImportResult> ImportAsync(IEnumerable<ExportedDiagram> items, bool overwrite, CancellationToken ct) =>
        ImportAsync(items, overwrite, actor.UserId, actor.Enforced, ct);

    public async Task<ImportResult> ImportAsync(IEnumerable<ExportedDiagram> items, bool overwrite, string? ownerId, bool ownedOnly, CancellationToken ct)
    {
        int imported = 0, replaced = 0, skipped = 0;
        var overwritten = new List<string>();
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
            List<(ExportedModel Item, byte[] File, ModelFormat Format, string Sha)> decoded = [];
            if (item.Models is { Count: > 0 } bundle)
            {
                var kept = existing is null || !overwrite
                    ? (Bytes: 0L, Count: 0)
                    : (Bytes: await db.Models.Where(m => m.DiagramId == item.Id && !bundle.Select(b => b.Id).Contains(m.Id)).SumAsync(m => m.Size, ct),
                       Count: await db.Models.CountAsync(m => m.DiagramId == item.Id && !bundle.Select(b => b.Id).Contains(m.Id), ct));
                if (models.CheckBundle(bundle, kept.Bytes, kept.Count, out decoded) is { } modelError)
                {
                    rejected.Add(new RejectedDiagram(item.Id, item.Name, modelError));
                    continue;
                }
            }
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
                await db.SaveChangesAsync(ct);
                await StoreModelsAsync(item.Id, decoded, now, ct);
                replaced++;
                overwritten.Add(existing.Id);
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
                await db.SaveChangesAsync(ct);
                await StoreModelsAsync(item.Id, decoded, now, ct);
                imported++;
            }
        }
        await tx.CommitAsync(ct);
        foreach (var id in overwritten) await rooms.ReloadAsync(id);
        return new ImportResult(imported, replaced, skipped, rejected);
    }

    private async Task StoreModelsAsync(string diagramId, List<(ExportedModel Item, byte[] File, ModelFormat Format, string Sha)> decoded, long now, CancellationToken ct)
    {
        foreach (var (item, file, format, sha) in decoded)
        {
            await db.Models.Where(m => m.DiagramId == diagramId && m.Id == item.Id).ExecuteDeleteAsync(ct);
            db.Models.Add(ModelStore.Build(diagramId, item.Id, item.Name, file, format, sha, now));
        }
        await db.SaveChangesAsync(ct);
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
