using System.Security.Claims;

namespace Strata.Server.Auth;

public sealed record Actor(string? UserId, bool Enforced)
{
    public static Actor From(HttpContext? context, AuthSettings auth)
    {
        if (!auth.Enabled) return new Actor(null, false);
        var id = context?.User.FindFirstValue(ClaimTypes.NameIdentifier);
        return new Actor(id, true);
    }
}
