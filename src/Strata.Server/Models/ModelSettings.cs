namespace Strata.Server.Models;

public sealed record ModelSettings(long MaxBytes, int MaxPerDiagram, long MaxTotalPerDiagram)
{
    public static ModelSettings From(IConfiguration config)
    {
        var file = Megabytes(config["STRATA_MODEL_MAX_MB"], 25);
        var total = Megabytes(config["STRATA_MODEL_DIAGRAM_MAX_MB"], 250);
        var count = int.TryParse(config["STRATA_MODEL_MAX_COUNT"], out var c) && c >= 0 ? c : 50;
        return new ModelSettings(file, count, total);
    }

    private static long Megabytes(string? value, int fallback) =>
        (long.TryParse(value, out var mb) && mb >= 0 ? mb : fallback) * 1024 * 1024;
}
