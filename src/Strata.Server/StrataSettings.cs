namespace Strata.Server;

public sealed record StrataSettings(int Port, string DatabasePath, string? DistPath, bool Dev)
{
    public string ConnectionString => $"Data Source={DatabasePath}";

    public static StrataSettings From(IConfiguration config, IHostEnvironment env, string[] args)
    {
        var port = int.TryParse(config["PORT"], out var p) ? p : 3001;
        var db = config["STRATA_DB"] is { Length: > 0 } path ? path : "./data/strata.db";
        return new StrataSettings(port, db, FindDist(config, env), args.Contains("--dev"));
    }

    private static string? FindDist(IConfiguration config, IHostEnvironment env)
    {
        if (config["STRATA_DIST"] is { } explicitPath)
            return Directory.Exists(explicitPath) ? Path.GetFullPath(explicitPath) : null;

        string[] candidates = [Path.Combine(env.ContentRootPath, "dist"), Path.Combine(env.ContentRootPath, "..", "..", "dist")];
        return candidates.Where(Directory.Exists).Select(Path.GetFullPath).FirstOrDefault();
    }
}
