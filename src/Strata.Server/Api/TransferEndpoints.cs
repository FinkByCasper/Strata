using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Strata.Server.Storage;

namespace Strata.Server.Api;

public static class TransferEndpoints
{
    private const long ImportLimit = 128L * 1024 * 1024;

    public static void MapTransferApi(this RouteGroupBuilder api)
    {
        api.MapGet("/export", async (DiagramTransfer transfer, HttpResponse response, CancellationToken ct) =>
            {
                response.Headers.ContentDisposition = $"attachment; filename=\"strata-export-{DateTime.UtcNow:yyyy-MM-dd}.json\"";
                return TypedResults.Ok(await transfer.ExportAsync(ct));
            })
            .WithTags("Backup").WithSummary("Download the caller's diagrams (all of them when accounts are off) as one backup file");

        api.MapPost("/import", async (HttpRequest request, DiagramTransfer transfer, bool? overwrite, CancellationToken ct) =>
            {
                if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
                    limit.MaxRequestBodySize = ImportLimit;
                var file = await ReadFileAsync(request, ct);
                return TypedResults.Ok(await transfer.ImportAsync(file.Diagrams, overwrite ?? false, ct));
            })
            .Accepts<ExportFile>("application/json")
            .WithTags("Backup").WithSummary("Import a backup file produced by export; imported diagrams belong to the caller")
            .WithDescription("Diagrams whose id already exists are skipped unless overwrite=true. Invalid diagrams are reported in the result and do not stop the rest.");
    }

    private static async Task<ExportFile> ReadFileAsync(HttpRequest request, CancellationToken ct)
    {
        try
        {
            var bytes = await JsonBody.ReadBytesAsync(request, ImportLimit, ct);
            var file = JsonSerializer.Deserialize<ExportFile>(bytes, JsonSerializerOptions.Web);
            if (file is { Format: "strata-export", Diagrams: not null }) return file;
        }
        catch (JsonException) { }
        throw new ApiException(400, "not a Strata export file");
    }
}
