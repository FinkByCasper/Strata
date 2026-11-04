namespace Strata.Server.Auth;

public sealed record AuthSettings(bool Enabled, bool AllowSignup, string? AdminEmail, TimeSpan SessionLifetime)
{
    public static AuthSettings From(IConfiguration config)
    {
        var mode = config["STRATA_AUTH"]?.Trim().ToLowerInvariant();
        var enabled = mode switch
        {
            null or "" or "on" or "true" or "local" => true,
            "off" or "false" or "none" => false,
            _ => throw new InvalidOperationException($"STRATA_AUTH '{config["STRATA_AUTH"]}' is not supported. Use on or off."),
        };
        var allowSignup = !string.Equals(config["STRATA_ALLOW_SIGNUP"], "false", StringComparison.OrdinalIgnoreCase);
        var admin = config["STRATA_ADMIN_EMAIL"]?.Trim().ToLowerInvariant();
        var days = int.TryParse(config["STRATA_SESSION_DAYS"], out var d) && d > 0 ? d : 30;
        return new AuthSettings(enabled, allowSignup, string.IsNullOrEmpty(admin) ? null : admin, TimeSpan.FromDays(days));
    }
}
