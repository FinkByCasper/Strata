using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Storage;

namespace Strata.Server.Models;

public sealed class ModelStore(StrataDbContext db, ModelSettings settings)
{
    public static string NewId() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(8));

    public static string CleanName(string? name)
    {
        var cleaned = new StringBuilder();
        foreach (var ch in Path.GetFileName((name ?? "").Replace('\\', '/')))
            if (!char.IsControl(ch)) cleaned.Append(ch);
        var text = cleaned.ToString().Trim();
        return text.Length == 0 ? "model" : text.Length > 120 ? text[..120] : text;
    }

    public Task<List<ModelResponse>> ListAsync(string diagramId, CancellationToken ct) =>
        db.Models.Where(m => m.DiagramId == diagramId).OrderBy(m => m.CreatedAt).ThenBy(m => m.Id)
            .Select(m => new ModelResponse(m.Id, m.Name, m.Format, m.Size, m.Sha256, m.CreatedAt)).ToListAsync(ct);

    public Task<ModelResponse?> FindInfoAsync(string diagramId, string modelId, CancellationToken ct) =>
        db.Models.Where(m => m.DiagramId == diagramId && m.Id == modelId)
            .Select(m => new ModelResponse(m.Id, m.Name, m.Format, m.Size, m.Sha256, m.CreatedAt)).FirstOrDefaultAsync(ct);

    public Task<byte[]?> ReadAsync(string diagramId, string modelId, CancellationToken ct) =>
        db.Models.Where(m => m.DiagramId == diagramId && m.Id == modelId).Select(m => m.Data).FirstOrDefaultAsync(ct);

    public async Task<(ModelResponse Model, bool Created)> AddAsync(string diagramId, string? name, byte[] file, CancellationToken ct)
    {
        var (format, sha) = Inspect(file);
        if (await db.Models.Where(m => m.DiagramId == diagramId && m.Sha256 == sha)
                .Select(m => new ModelResponse(m.Id, m.Name, m.Format, m.Size, m.Sha256, m.CreatedAt)).FirstOrDefaultAsync(ct) is { } same)
            return (same, false);

        var used = await db.Models.Where(m => m.DiagramId == diagramId).GroupBy(_ => 1).Select(g => new { Count = g.Count(), Bytes = g.Sum(m => m.Size) }).FirstOrDefaultAsync(ct);
        if ((used?.Count ?? 0) >= settings.MaxPerDiagram) throw new ApiException(409, $"this diagram already has the most models allowed ({settings.MaxPerDiagram}); delete one you no longer use");
        if ((used?.Bytes ?? 0) + file.Length > settings.MaxTotalPerDiagram) throw new ApiException(409, "this diagram's models would take up more space than allowed; delete one you no longer use");

        var asset = Build(diagramId, NewId(), name, file, format, sha, DiagramStore.Now());
        db.Models.Add(asset);
        await db.SaveChangesAsync(ct);
        return (ToResponse(asset), true);
    }

    public async Task DeleteAsync(Diagram diagram, string modelId, CancellationToken ct)
    {
        if (!await db.Models.AnyAsync(m => m.DiagramId == diagram.Id && m.Id == modelId, ct)) throw new ApiException(404, "not found");
        if (diagram.Data.Contains(modelId, StringComparison.Ordinal) || await db.Versions.AnyAsync(v => v.DiagramId == diagram.Id && v.Data.Contains(modelId), ct))
            throw new ApiException(409, "this model is used by the diagram or by one of its saved versions");
        await db.Models.Where(m => m.DiagramId == diagram.Id && m.Id == modelId).ExecuteDeleteAsync(ct);
    }

    public (ModelFormat Format, string Sha256) Inspect(byte[] file)
    {
        if (file.Length > settings.MaxBytes) throw new ApiException(413, $"the model is larger than {settings.MaxBytes / 1024 / 1024} MB");
        if (GltfValidator.Check(file, out var format) is { } problem) throw new ApiException(400, problem);
        return (format, Convert.ToHexStringLower(SHA256.HashData(file)));
    }

    public string? CheckBundle(IReadOnlyList<ExportedModel> bundle, long alreadyStoredBytes, int alreadyStoredCount, out List<(ExportedModel Item, byte[] File, ModelFormat Format, string Sha)> decoded)
    {
        decoded = [];
        var seen = new HashSet<string>(StringComparer.Ordinal);
        long bytes = alreadyStoredBytes;
        foreach (var item in bundle)
        {
            if (item?.Id is null || !System.Text.RegularExpressions.Regex.IsMatch(item.Id, "^[A-Za-z0-9_-]{1,64}$") || !seen.Add(item.Id)) return "bad model id";
            if (item.Data is null || item.Data.Length > settings.MaxBytes / 3 * 4 + 8) return $"model {item.Id} is too large";
            byte[] file;
            try { file = Convert.FromBase64String(item.Data); }
            catch (FormatException) { return $"model {item.Id} is not valid base64"; }
            try { var (format, sha) = Inspect(file); decoded.Add((item, file, format, sha)); }
            catch (ApiException e) { return $"model {item.Id}: {e.Message}"; }
            bytes += file.Length;
        }
        if (alreadyStoredCount + decoded.Count > settings.MaxPerDiagram) return "too many models";
        if (bytes > settings.MaxTotalPerDiagram) return "the models take up more space than allowed";
        return null;
    }

    public static ModelAsset Build(string diagramId, string id, string? name, byte[] file, ModelFormat format, string sha, long now) =>
        new() { DiagramId = diagramId, Id = id, Name = CleanName(name), Format = format, Sha256 = sha, Size = file.Length, Data = file, CreatedAt = now };

    public static ModelResponse ToResponse(ModelAsset m) => new(m.Id, m.Name, m.Format, m.Size, m.Sha256, m.CreatedAt);
}
