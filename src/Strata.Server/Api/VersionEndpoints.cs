using Strata.Data;
using Strata.Server.Live;
using Strata.Server.Storage;

namespace Strata.Server.Api;

public static class VersionEndpoints
{
    public static void MapVersionApi(this RouteGroupBuilder api)
    {
        var versions = api.MapGroup("/diagrams/{id}/versions").WithTags("History");

        versions.MapGet("", async (string id, DiagramStore store, VersionStore history, CancellationToken ct) =>
            {
                var access = await store.FindAsync(id, ct) ?? throw NotFound();
                return TypedResults.Ok(await history.ListAsync(access.Diagram.Id, ct));
            })
            .WithSummary("List a diagram's saved versions, newest first");

        versions.MapGet("{versionId}", async (string id, string versionId, DiagramStore store, VersionStore history, CancellationToken ct) =>
            {
                var access = await store.FindAsync(id, ct) ?? throw NotFound();
                var version = await history.GetAsync(access.Diagram.Id, versionId, ct) ?? throw NotFound();
                var summary = (await history.ListAsync(access.Diagram.Id, ct)).First(v => v.Id == version.Id);
                return TypedResults.Ok(VersionStore.ToResponse(summary, version));
            })
            .WithSummary("Get one version with its content");

        versions.MapPost("", async (HttpRequest request, string id, DiagramStore store, VersionStore history, CancellationToken ct) =>
            {
                var access = (await store.FindAsync(id, ct) ?? throw NotFound()).Require(AccessLevel.Editor, "read-only access");
                var body = await JsonBody.ReadObjectAsync(request, ct);
                var label = body.TryGetProperty("label", out var l) && l.ValueKind == System.Text.Json.JsonValueKind.String ? l.GetString()!.Trim() : null;
                if (label is { Length: > 200 }) throw new ApiException(400, "label is too long");
                var created = await history.CreateManualAsync(access.Diagram, string.IsNullOrEmpty(label) ? null : label, ct);
                return TypedResults.Created($"/api/diagrams/{id}/versions/{created.Id}", created);
            })
            .Accepts<VersionInput>(isOptional: true, "application/json", "*/*")
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .WithSummary("Save a named version of the diagram as it is now (owner or editor)");

        versions.MapPost("{versionId}/restore", async (string id, string versionId, DiagramStore store, VersionStore history, DiagramRooms rooms, CancellationToken ct) =>
            {
                var access = (await store.FindAsync(id, ct) ?? throw NotFound()).Require(AccessLevel.Editor, "read-only access");
                var version = await history.GetAsync(access.Diagram.Id, versionId, ct) ?? throw NotFound();
                await history.RestoreAsync(access.Diagram, version, ct);
                await rooms.ReloadAsync(id);
                return TypedResults.Ok(DiagramStore.ToResponse(access));
            })
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .WithSummary("Make a version the current state of the diagram (owner or editor)")
            .WithDescription("The state being replaced is kept as a version of kind restore first, so a restore can itself be undone.");

        versions.MapDelete("{versionId}", async (string id, string versionId, DiagramStore store, VersionStore history, CancellationToken ct) =>
            {
                var access = (await store.FindAsync(id, ct) ?? throw NotFound()).Require(AccessLevel.Owner, "only the owner can delete versions");
                return await history.DeleteAsync(access.Diagram.Id, versionId, ct) ? Results.NoContent() : throw NotFound();
            })
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .WithSummary("Delete a version (owner only)");
    }

    private static ApiException NotFound() => new(404, "not found");
}
