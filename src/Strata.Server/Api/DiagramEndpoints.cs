using System.Text.Json;
using Microsoft.AspNetCore.Http.HttpResults;
using Strata.Server.Storage;
using Strata.Server.Validation;

namespace Strata.Server.Api;

public static class DiagramEndpoints
{
    private static readonly JsonElement EmptyDiagram =
        JsonDocument.Parse("""{"nodes":[],"connectors":[],"zones":[]}""").RootElement;

    private static readonly NotFound<ErrorResponse> Missing = TypedResults.NotFound(new ErrorResponse("not found"));

    public static void MapDiagramApi(this IEndpointRouteBuilder routes)
    {
        var api = routes.MapGroup("/api");

        api.MapGet("/diagrams", async (DiagramStore store, CancellationToken ct) => TypedResults.Ok(await store.ListAsync(ct)))
            .WithTags("Diagrams").WithSummary("List diagrams, newest first");

        api.MapPost("/diagrams", Create)
            .Accepts<DiagramInput>(isOptional: true, "application/json", "*/*")
            .WithTags("Diagrams").WithSummary("Create a diagram");

        api.MapGet("/diagrams/{id}", Get)
            .WithTags("Diagrams").WithSummary("Get a diagram with its view token");

        api.MapPut("/diagrams/{id}", Save)
            .Accepts<DiagramInput>(isOptional: true, "application/json", "*/*")
            .WithTags("Diagrams").WithSummary("Replace a diagram's name and content");

        api.MapPost("/diagrams/{id}/rotate-view-token", RotateToken)
            .WithTags("Sharing").WithSummary("Revoke the current view link and issue a new one");

        api.MapDelete("/diagrams/{id}", Remove)
            .WithTags("Diagrams").WithSummary("Delete a diagram");

        api.MapGet("/shared/{token}", Shared)
            .WithTags("Sharing").WithSummary("Read a diagram through its public view token");

        api.Map("/{**rest}", () => Missing).ExcludeFromDescription();
    }

    private static async Task<Results<Created<DiagramResponse>, BadRequest<ErrorResponse>>> Create(HttpRequest request, DiagramStore store, CancellationToken ct)
    {
        var body = await JsonBody.ReadObjectAsync(request, ct);
        var name = body.TryGetProperty("name", out var n) ? n : JsonDocument.Parse("\"Untitled diagram\"").RootElement;
        var data = body.TryGetProperty("data", out var d) ? d : EmptyDiagram;

        if (Reject(name, data) is { } error) return TypedResults.BadRequest(new ErrorResponse(error));
        var created = await store.CreateAsync(name.GetString()!, data.GetRawText(), ct);
        return TypedResults.Created($"/api/diagrams/{created.Id}", DiagramStore.ToResponse(created));
    }

    private static async Task<Results<Ok<DiagramResponse>, NotFound<ErrorResponse>>> Get(string id, DiagramStore store, CancellationToken ct) =>
        await store.GetAsync(id, ct) is { } d ? TypedResults.Ok(DiagramStore.ToResponse(d)) : Missing;

    private static async Task<Results<Ok<DiagramResponse>, NotFound<ErrorResponse>, BadRequest<ErrorResponse>>> Save(string id, HttpRequest request, DiagramStore store, CancellationToken ct)
    {
        var body = await JsonBody.ReadObjectAsync(request, ct);
        body.TryGetProperty("name", out var name);
        body.TryGetProperty("data", out var data);

        if (Reject(name, data) is { } error) return TypedResults.BadRequest(new ErrorResponse(error));
        return await store.SaveAsync(id, name.GetString()!, data.GetRawText(), ct) is { } saved
            ? TypedResults.Ok(DiagramStore.ToResponse(saved))
            : Missing;
    }

    private static async Task<Results<Ok<ViewTokenResponse>, NotFound<ErrorResponse>>> RotateToken(string id, DiagramStore store, CancellationToken ct) =>
        await store.RotateTokenAsync(id, ct) is { } token ? TypedResults.Ok(new ViewTokenResponse(token)) : Missing;

    private static async Task<Results<NoContent, NotFound<ErrorResponse>>> Remove(string id, DiagramStore store, CancellationToken ct) =>
        await store.RemoveAsync(id, ct) ? TypedResults.NoContent() : Missing;

    private static async Task<Results<Ok<SharedDiagramResponse>, NotFound<ErrorResponse>>> Shared(string token, DiagramStore store, CancellationToken ct) =>
        await store.GetByTokenAsync(token, ct) is { } d
            ? TypedResults.Ok(new SharedDiagramResponse(d.Name, DiagramStore.ParseData(d.Data), d.UpdatedAt))
            : Missing;

    private static string? Reject(JsonElement name, JsonElement data)
    {
        var problem = DiagramValidator.Validate(data);
        if (problem is not null) return problem;
        return name.ValueKind == JsonValueKind.String && name.GetString()!.Length <= 200 ? null : "bad name";
    }
}
