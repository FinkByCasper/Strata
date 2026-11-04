using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Strata.Data;
using Strata.Server.Api;
using Strata.Server.Storage;

namespace Strata.Server.Auth;

public partial class AccountService(StrataDbContext db, AuthSettings auth, LoginThrottle throttle, PasswordHasher<User> hasher)
{
    public const int MinPasswordLength = 10;
    public const int MaxPasswordLength = 128;

    private static readonly User Decoy = new() { Id = "", Email = "", DisplayName = "", PasswordHash = "" };
    private readonly string decoyHash = hasher.HashPassword(Decoy, "decoy-password-for-timing");

    public static string HashToken(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    public static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();

    public async Task<(User User, string Token)> RegisterAsync(string? email, string? password, string? displayName, CancellationToken ct)
    {
        var address = NormalizeEmail(email);
        if (address.Length > 254 || !EmailPattern().IsMatch(address)) throw new ApiException(400, "enter a valid email address");
        if (password is null || password.Length < MinPasswordLength || password.Length > MaxPasswordLength)
            throw new ApiException(400, $"password must be {MinPasswordLength} to {MaxPasswordLength} characters");

        var name = (displayName ?? "").Trim();
        if (name.Length == 0) name = address[..address.IndexOf('@')];
        if (name.Length > 80) throw new ApiException(400, "name is too long");

        var anyUser = await db.Users.AnyAsync(ct);
        if (anyUser && !auth.AllowSignup) throw new ApiException(403, "sign-ups are closed");
        if (await db.Users.AnyAsync(u => u.Email == address, ct)) throw new ApiException(409, "an account with that email already exists");

        var user = new User { Id = Guid.NewGuid().ToString(), Email = address, DisplayName = name, PasswordHash = "", CreatedAt = DiagramStore.Now() };
        user.PasswordHash = hasher.HashPassword(user, password);
        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            db.Entry(user).State = EntityState.Detached;
            if (await db.Users.AnyAsync(u => u.Email == address, ct)) throw new ApiException(409, "an account with that email already exists");
            throw;
        }

        await ClaimLegacyDiagramsAsync(user, ct);
        return (user, await StartSessionAsync(user, ct));
    }

    public async Task<(User User, string Token)> LoginAsync(string? email, string? password, string clientAddress, CancellationToken ct)
    {
        var address = NormalizeEmail(email);
        var keys = new[] { $"email:{address}", $"ip:{clientAddress}" };
        if (keys.Any(throttle.IsBlocked)) throw new ApiException(429, "too many attempts, try again in a few minutes");

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == address, ct);
        var verdict = hasher.VerifyHashedPassword(user ?? Decoy, user?.PasswordHash ?? decoyHash, password ?? "");
        if (user is null || verdict == PasswordVerificationResult.Failed)
        {
            foreach (var key in keys) throttle.RecordFailure(key);
            throw new ApiException(401, "wrong email or password");
        }

        throttle.Reset(keys[0]);
        if (verdict == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, password!);
            await db.SaveChangesAsync(ct);
        }

        await ClaimLegacyDiagramsAsync(user, ct);
        return (user, await StartSessionAsync(user, ct));
    }

    public Task EndSessionAsync(string token, CancellationToken ct)
    {
        var hash = HashToken(token);
        return db.Sessions.Where(s => s.TokenHash == hash).ExecuteDeleteAsync(ct);
    }

    public async Task<bool> SignupOpenAsync(CancellationToken ct) => auth.AllowSignup || !await db.Users.AnyAsync(ct);

    private async Task<string> StartSessionAsync(User user, CancellationToken ct)
    {
        var now = DiagramStore.Now();
        await db.Sessions.Where(s => s.ExpiresAt < now).ExecuteDeleteAsync(ct);

        var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        db.Sessions.Add(new Session
        {
            TokenHash = HashToken(token),
            UserId = user.Id,
            CreatedAt = now,
            ExpiresAt = now + (long)auth.SessionLifetime.TotalMilliseconds,
        });
        await db.SaveChangesAsync(ct);
        return token;
    }

    private async Task ClaimLegacyDiagramsAsync(User user, CancellationToken ct)
    {
        if (!await IsClaimantAsync(user, ct)) return;
        await db.Diagrams.Where(d => d.OwnerId == null).ExecuteUpdateAsync(s => s.SetProperty(d => d.OwnerId, user.Id), ct);
    }

    private async Task<bool> IsClaimantAsync(User user, CancellationToken ct)
    {
        if (auth.AdminEmail is not null) return user.Email == auth.AdminEmail;
        var first = await db.Users.OrderBy(u => u.CreatedAt).ThenBy(u => u.Id).Select(u => u.Id).FirstAsync(ct);
        return first == user.Id;
    }

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();
}
