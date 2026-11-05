namespace Strata.Server.Live;

public sealed record LiveSettings(TimeSpan SaveDelay)
{
    public const int MaxOpsPerBatch = 500;
    public const int MaxMessageBytes = 5 * 1024 * 1024;

    public static LiveSettings From(IConfiguration config)
    {
        var ms = int.TryParse(config["STRATA_LIVE_SAVE_DELAY_MS"], out var m) && m >= 0 ? m : 1500;
        return new LiveSettings(TimeSpan.FromMilliseconds(ms));
    }
}
