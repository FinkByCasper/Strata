using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Http.Features;
using Strata.Data;
using Strata.Server.Models;
using Strata.Server.Storage;

namespace Strata.Server.Api;

public static class ModelEndpoints
{
    private static readonly NotFound<ErrorResponse> Missing = TypedResults.NotFound(new ErrorResponse("not found"));

    public static void MapModelApi(this RouteGroupBuilder api)
    {
        var models = api.MapGroup("/diagrams/{id}/models").WithTags("Models");

        models.MapGet("", async (string id, DiagramStore store, ModelStore files, CancellationToken ct) =>
                await store.FindAsync(id, ct) is null ? (IResult)Missing : TypedResults.Ok(await files.ListAsync(id, ct)))
            .Produces<List<ModelResponse>>()
            .Produces<ErrorResponse>(StatusCodes.Status404NotFound)
            .WithSummary("List the 3D models stored with a diagram");

        models.MapPost("", async (string id, string? name, HttpRequest request, DiagramStore store, ModelStore files, ModelSettings settings, CancellationToken ct) =>
            {
                if (await store.FindAsync(id, ct) is not { } access) return (IResult)Missing;
                access.Require(AccessLevel.Editor, "read-only access");
                if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
                    limit.MaxRequestBodySize = settings.MaxBytes;
                var file = await JsonBody.ReadBytesAsync(request, settings.MaxBytes, ct);
                var (model, created) = await files.AddAsync(id, name, file, ct);
                return created ? TypedResults.Created($"/api/diagrams/{id}/models/{model.Id}", model) : TypedResults.Ok(model);
            })
            .Accepts<byte[]>("model/gltf-binary", "model/gltf+json", "application/octet-stream")
            .Produces<ModelResponse>(StatusCodes.Status201Created)
            .Produces<ModelResponse>()
            .Produces<ErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .Produces<ErrorResponse>(StatusCodes.Status404NotFound)
            .Produces<ErrorResponse>(StatusCodes.Status409Conflict)
            .Produces<ErrorResponse>(StatusCodes.Status413PayloadTooLarge)
            .WithSummary("Upload a 3D model (editor or owner)")
            .WithDescription("The request body is the file itself (<c>.glb</c>, or <c>.gltf</c> with buffers and images embedded); <c>name</c> is the original file name. The file is inspected, not trusted: files that are not glTF 2.0, that reference external files, or that exceed the size and detail limits are refused. Uploading a file the diagram already holds returns the existing model with 200.");

        models.MapGet("{modelId}", async (string id, string modelId, HttpContext http, DiagramStore store, ModelStore files, CancellationToken ct) =>
                await store.FindAsync(id, ct) is null ? Missing : await Send(id, modelId, http, files, ct))
            .Produces<byte[]>(contentType: "model/gltf-binary")
            .Produces(StatusCodes.Status304NotModified)
            .Produces<ErrorResponse>(StatusCodes.Status404NotFound)
            .WithSummary("Download a model file");

        models.MapDelete("{modelId}", async (string id, string modelId, DiagramStore store, ModelStore files, CancellationToken ct) =>
            {
                if (await store.FindAsync(id, ct) is not { } access) return (IResult)Missing;
                access.Require(AccessLevel.Editor, "read-only access");
                await files.DeleteAsync(access.Diagram, modelId, ct);
                return TypedResults.NoContent();
            })
            .Produces(StatusCodes.Status204NoContent)
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .Produces<ErrorResponse>(StatusCodes.Status404NotFound)
            .Produces<ErrorResponse>(StatusCodes.Status409Conflict)
            .WithSummary("Delete a model nothing uses (editor or owner)")
            .WithDescription("Refused with 409 while the diagram or any of its saved versions still refers to the model, so restoring a version never loses a model.");
    }

    public static void MapSharedModelApi(this RouteGroupBuilder api) =>
        api.MapGet("/shared/{token}/models/{modelId}", async (string token, string modelId, HttpContext http, DiagramStore store, ModelStore files, CancellationToken ct) =>
                await store.GetByTokenAsync(token, ct) is not { } diagram ? Missing : await Send(diagram.Id, modelId, http, files, ct))
            .Produces<byte[]>(contentType: "model/gltf-binary")
            .Produces(StatusCodes.Status304NotModified)
            .Produces<ErrorResponse>(StatusCodes.Status404NotFound)
            .WithTags("Sharing", "Models").WithSummary("Download a model of a diagram opened through its public view token; needs no account");

    private static async Task<IResult> Send(string diagramId, string modelId, HttpContext http, ModelStore files, CancellationToken ct)
    {
        if (await files.FindInfoAsync(diagramId, modelId, ct) is not { } info) return Missing;

        var etag = $"\"{info.Sha256}\"";
        http.Response.Headers.ETag = etag;
        http.Response.Headers.CacheControl = "private, no-cache";
        http.Response.Headers.XContentTypeOptions = "nosniff";
        if (http.Request.Headers.IfNoneMatch == etag) return TypedResults.StatusCode(StatusCodes.Status304NotModified);

        var data = await files.ReadAsync(diagramId, modelId, ct);
        if (data is null) return Missing;
        http.Response.Headers.ContentDisposition = $"attachment; filename=\"model.{(info.Format == ModelFormat.Glb ? "glb" : "gltf")}\"";
        return TypedResults.Bytes(data, info.Format == ModelFormat.Glb ? "model/gltf-binary" : "model/gltf+json");
    }
}
