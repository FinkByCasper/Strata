namespace Strata.Server.Storage;

public sealed record HistorySettings(TimeSpan Interval, int MaxAutomatic)
{
    public static HistorySettings From(IConfiguration config)
    {
        var minutes = int.TryParse(config["STRATA_HISTORY_INTERVAL_MINUTES"], out var m) && m >= 0 ? m : 10;
        var max = int.TryParse(config["STRATA_HISTORY_MAX"], out var x) && x >= 0 ? x : 100;
        return new HistorySettings(TimeSpan.FromMinutes(minutes), max);
    }
}
