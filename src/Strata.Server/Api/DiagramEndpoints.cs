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

    public static void MapDiagramApi(this RouteGroupBuilder api)
    {
        api.MapGet("/diagrams", async (DiagramStore store, CancellationToken ct) => TypedResults.Ok(await store.ListAsync(ct)))
            .WithTags("Diagrams").WithSummary("List the diagrams the caller owns or that are shared with them, newest first");

        api.MapPost("/diagrams", Create)
            .Accepts<DiagramInput>(isOptional: true, "application/json", "*/*")
            .WithTags("Diagrams").WithSummary("Create a diagram owned by the caller");

        api.MapGet("/diagrams/{id}", Get)
            .WithTags("Diagrams").WithSummary("Get a diagram; the view token is only included for the owner");

        api.MapPut("/diagrams/{id}", Save)
            .Accepts<DiagramInput>(isOptional: true, "application/json", "*/*")
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .WithTags("Diagrams").WithSummary("Replace a diagram's name and content (owner or editor)");

        api.MapPost("/diagrams/{id}/rotate-view-token", RotateToken)
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .WithTags("Sharing").WithSummary("Revoke the current view link and issue a new one (owner only)");

        api.MapDelete("/diagrams/{id}", Remove)
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .WithTags("Diagrams").WithSummary("Delete a diagram (owner only)");
    }

    public static void MapSharedApi(this RouteGroupBuilder api) =>
        api.MapGet("/shared/{token}", Shared)
            .WithTags("Sharing").WithSummary("Read a diagram through its public view token; needs no account");

    private static async Task<Results<Created<DiagramResponse>, BadRequest<ErrorResponse>>> Create(HttpRequest request, DiagramStore store, CancellationToken ct)
    {
        var body = await JsonBody.ReadObjectAsync(request, ct);
        var name = body.TryGetProperty("name", out var n) ? n : JsonDocument.Parse("\"Untitled diagram\"").RootElement;
        var data = body.TryGetProperty("data", out var d) ? d : EmptyDiagram;

        if (Reject(name, data) is { } error) return TypedResults.BadRequest(new ErrorResponse(error));
        var created = await store.CreateAsync(name.GetString()!, data.GetRawText(), ct);
        return TypedResults.Created($"/api/diagrams/{created.Id}", DiagramStore.ToResponse(new Access(created, AccessLevel.Owner)));
    }

    private static async Task<Results<Ok<DiagramResponse>, NotFound<ErrorResponse>>> Get(string id, DiagramStore store, CancellationToken ct) =>
        await store.FindAsync(id, ct) is { } access ? TypedResults.Ok(DiagramStore.ToResponse(access)) : Missing;

    private static async Task<Results<Ok<DiagramResponse>, NotFound<ErrorResponse>, BadRequest<ErrorResponse>>> Save(string id, HttpRequest request, DiagramStore store, CancellationToken ct)
    {
        var body = await JsonBody.ReadObjectAsync(request, ct);
        body.TryGetProperty("name", out var name);
        body.TryGetProperty("data", out var data);

        if (await store.FindAsync(id, ct) is not { } access) return Missing;
        access.Require(AccessLevel.Editor, "read-only access");
        if (Reject(name, data) is { } error) return TypedResults.BadRequest(new ErrorResponse(error));

        await store.SaveAsync(access.Diagram, name.GetString()!, data.GetRawText(), ct);
        return TypedResults.Ok(DiagramStore.ToResponse(access));
    }

    private static async Task<Results<Ok<ViewTokenResponse>, NotFound<ErrorResponse>>> RotateToken(string id, DiagramStore store, CancellationToken ct)
    {
        if (await store.FindAsync(id, ct) is not { } access) return Missing;
        access.Require(AccessLevel.Owner, "only the owner can change the view link");
        return TypedResults.Ok(new ViewTokenResponse(await store.RotateTokenAsync(access.Diagram, ct)));
    }

    private static async Task<Results<NoContent, NotFound<ErrorResponse>>> Remove(string id, DiagramStore store, CancellationToken ct)
    {
        if (await store.FindAsync(id, ct) is not { } access) return Missing;
        access.Require(AccessLevel.Owner, "only the owner can delete this diagram");
        await store.RemoveAsync(access.Diagram, ct);
        return TypedResults.NoContent();
    }

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
