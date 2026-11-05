using Microsoft.AspNetCore.Http.HttpResults;
using Strata.Server.Auth;
using Strata.Server.Live;
using Strata.Server.Storage;

namespace Strata.Server.Api;

public static class ShareEndpoints
{
    public static void MapShareApi(this RouteGroupBuilder api)
    {
        var shares = api.MapGroup("/diagrams/{id}/shares").WithTags("Sharing");

        shares.MapGet("", async (string id, AuthSettings settings, DiagramStore store, CancellationToken ct) =>
            {
                var access = await Owned(id, settings, store, ct);
                return TypedResults.Ok(await store.SharesAsync(access.Diagram.Id, ct));
            })
            .WithSummary("List the accounts a diagram is shared with (owner only)");

        shares.MapPut("", async (string id, ShareInput input, AuthSettings settings, DiagramStore store, DiagramRooms rooms, CancellationToken ct) =>
            {
                var access = await Owned(id, settings, store, ct);
                var role = input.Role ?? throw new ApiException(400, "role must be viewer or editor");
                var shared = await store.ShareAsync(access.Diagram, input.Email, role, ct);
                await rooms.KickAsync(id, shared.UserId);
                return TypedResults.Ok(shared);
            })
            .WithSummary("Share a diagram with an account, or change that account's role (owner only)")
            .Produces<ErrorResponse>(StatusCodes.Status404NotFound);

        shares.MapDelete("{userId}", async (string id, string userId, AuthSettings settings, Actor actor, DiagramStore store, DiagramRooms rooms, CancellationToken ct) =>
            {
                if (!settings.Enabled) throw new ApiException(400, "sharing needs accounts");
                var access = await store.FindAsync(id, ct) ?? throw new ApiException(404, "not found");
                if (access.Level != AccessLevel.Owner && userId != actor.UserId)
                    throw new ApiException(403, "only the owner can remove other people");
                if (!await store.UnshareAsync(access.Diagram.Id, userId, ct)) return Results.NotFound(new ErrorResponse("not found"));
                await rooms.KickAsync(id, userId);
                return Results.NoContent();
            })
            .WithSummary("Stop sharing with an account; anyone can also remove themselves from a diagram shared with them");
    }

    private static async Task<Access> Owned(string id, AuthSettings settings, DiagramStore store, CancellationToken ct)
    {
        if (!settings.Enabled) throw new ApiException(400, "sharing needs accounts");
        var access = await store.FindAsync(id, ct) ?? throw new ApiException(404, "not found");
        return access.Require(AccessLevel.Owner, "only the owner can manage sharing");
    }
}
