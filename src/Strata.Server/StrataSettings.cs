using Strata.Data;

namespace Strata.Server;

public sealed record StrataSettings(int Port, DatabaseProvider Provider, string ConnectionString, string DatabaseLabel, string? DistPath, bool Dev)
{
    public static StrataSettings From(IConfiguration config, IHostEnvironment env, string[] args)
    {
        var port = int.TryParse(config["PORT"], out var p) ? p : 3001;
        var (provider, connection, label) = ReadDatabase(config);
        return new StrataSettings(port, provider, connection, label, FindDist(config, env), args.Contains("--dev"));
    }

    private static (DatabaseProvider, string, string) ReadDatabase(IConfiguration config)
    {
        var name = config["STRATA_DB_PROVIDER"];
        if (!DatabaseConfiguration.TryParse(name, out var provider))
            throw new InvalidOperationException($"STRATA_DB_PROVIDER '{name}' is not supported. Use sqlite, postgres or sqlserver.");

        if (provider == DatabaseProvider.Sqlite)
        {
            var path = config["STRATA_DB"] is { Length: > 0 } configured ? configured : "./data/strata.db";
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            return (provider, $"Data Source={path}", path);
        }

        var connection = config["STRATA_DB_CONNECTION"];
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException($"STRATA_DB_PROVIDER is {provider}, so STRATA_DB_CONNECTION must hold its connection string.");
        return (provider, connection, provider.ToString());
    }

    private static string? FindDist(IConfiguration config, IHostEnvironment env)
    {
        if (config["STRATA_DIST"] is { } explicitPath)
            return Directory.Exists(explicitPath) ? Path.GetFullPath(explicitPath) : null;

        string[] candidates = [Path.Combine(env.ContentRootPath, "dist"), Path.Combine(env.ContentRootPath, "..", "..", "dist")];
        return candidates.Where(Directory.Exists).Select(Path.GetFullPath).FirstOrDefault();
    }
}
