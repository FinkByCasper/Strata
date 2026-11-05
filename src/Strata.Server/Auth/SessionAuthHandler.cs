using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Storage;

namespace Strata.Server.Auth;

public sealed class SessionAuthHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder, StrataDbContext db)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string SchemeName = "Session";
    public const string CookieName = "strata_session";

    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(CookieName, out var token) || string.IsNullOrEmpty(token)) return AuthenticateResult.NoResult();

        var hash = AccountService.HashToken(token);
        var now = DiagramStore.Now();
        var user = await db.Sessions
            .Where(s => s.TokenHash == hash && s.ExpiresAt > now)
            .Join(db.Users, s => s.UserId, u => u.Id, (_, u) => new { u.Id, u.Email, u.DisplayName })
            .FirstOrDefaultAsync(Context.RequestAborted);
        if (user is null) return AuthenticateResult.NoResult();

        var identity = new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Email, user.Email), new Claim(ClaimTypes.Name, user.DisplayName)],
            SchemeName);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName));
    }

    protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        Response.StatusCode = StatusCodes.Status401Unauthorized;
        await Response.WriteAsJsonAsync(new ErrorResponse("sign in required"));
    }
}
