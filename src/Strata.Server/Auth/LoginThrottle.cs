using System.Collections.Concurrent;

namespace Strata.Server.Auth;

public sealed class LoginThrottle(TimeProvider clock)
{
    private const int MaxFailures = 10;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);

    private readonly ConcurrentDictionary<string, (int Failures, DateTimeOffset Since)> attempts = new();

    public bool IsBlocked(string key)
    {
        if (!attempts.TryGetValue(key, out var entry)) return false;
        if (clock.GetUtcNow() - entry.Since > Window)
        {
            attempts.TryRemove(key, out _);
            return false;
        }
        return entry.Failures >= MaxFailures;
    }

    public void RecordFailure(string key)
    {
        var now = clock.GetUtcNow();
        attempts.AddOrUpdate(key, _ => (1, now), (_, old) => now - old.Since > Window ? (1, now) : (old.Failures + 1, old.Since));
        if (attempts.Count > 10_000)
            foreach (var stale in attempts.Where(a => now - a.Value.Since > Window).Select(a => a.Key))
                attempts.TryRemove(stale, out _);
    }

    public void Reset(string key) => attempts.TryRemove(key, out _);
}
