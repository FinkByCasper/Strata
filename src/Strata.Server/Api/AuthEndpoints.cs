using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Strata.Server.Auth;

namespace Strata.Server.Api;

public static class AuthEndpoints
{
    public static void MapAuthApi(this RouteGroupBuilder api)
    {
        var auth = api.MapGroup("/auth").WithTags("Accounts");

        auth.MapGet("/me", async (HttpContext ctx, AuthSettings settings, AccountService accounts, CancellationToken ct) =>
            {
                if (!settings.Enabled) return new SessionResponse(false, false, null);
                var user = ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) is { } id
                    ? new UserResponse(id, ctx.User.FindFirstValue(ClaimTypes.Email)!, ctx.User.FindFirstValue(ClaimTypes.Name)!)
                    : null;
                return new SessionResponse(true, await accounts.SignupOpenAsync(ct), user);
            })
            .WithSummary("Who is signed in, and whether sign-in is needed at all");

        auth.MapPost("/register", async (RegisterInput input, HttpContext ctx, AuthSettings settings, AccountService accounts, CancellationToken ct) =>
            {
                RequireAccounts(settings);
                var (user, token) = await accounts.RegisterAsync(input.Email, input.Password, input.DisplayName, ct);
                SetCookie(ctx, settings, token);
                return TypedResults.Created("/api/auth/me", new UserResponse(user.Id, user.Email, user.DisplayName));
            })
            .WithSummary("Create an account and sign in")
            .Produces<ErrorResponse>(StatusCodes.Status400BadRequest)
            .Produces<ErrorResponse>(StatusCodes.Status403Forbidden)
            .Produces<ErrorResponse>(StatusCodes.Status409Conflict);

        auth.MapPost("/login", async (LoginInput input, HttpContext ctx, AuthSettings settings, AccountService accounts, CancellationToken ct) =>
            {
                RequireAccounts(settings);
                var address = ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown";
                var (user, token) = await accounts.LoginAsync(input.Email, input.Password, address, ct);
                SetCookie(ctx, settings, token);
                return TypedResults.Ok(new UserResponse(user.Id, user.Email, user.DisplayName));
            })
            .WithSummary("Sign in")
            .Produces<ErrorResponse>(StatusCodes.Status401Unauthorized)
            .Produces<ErrorResponse>(StatusCodes.Status429TooManyRequests);

        auth.MapPost("/logout", async (HttpContext ctx, AccountService accounts, CancellationToken ct) =>
            {
                if (ctx.Request.Cookies.TryGetValue(SessionAuthHandler.CookieName, out var token) && !string.IsNullOrEmpty(token))
                    await accounts.EndSessionAsync(token, ct);
                ctx.Response.Cookies.Delete(SessionAuthHandler.CookieName, new CookieOptions { Path = "/" });
                return TypedResults.NoContent();
            })
            .WithSummary("Sign out and end the session on the server");
    }

    private static void RequireAccounts(AuthSettings settings)
    {
        if (!settings.Enabled) throw new ApiException(404, "accounts are switched off on this server");
    }

    private static void SetCookie(HttpContext ctx, AuthSettings settings, string token) =>
        ctx.Response.Cookies.Append(SessionAuthHandler.CookieName, token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = ctx.Request.IsHttps,
            Path = "/",
            MaxAge = settings.SessionLifetime,
        });
}
