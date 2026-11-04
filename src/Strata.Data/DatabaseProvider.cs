using Microsoft.EntityFrameworkCore;

namespace Strata.Data;

public enum DatabaseProvider
{
    Sqlite,
    Postgres,
}

public static class DatabaseConfiguration
{
    public static bool TryParse(string? name, out DatabaseProvider provider)
    {
        switch (name?.Trim().ToLowerInvariant())
        {
            case null or "" or "sqlite":
                provider = DatabaseProvider.Sqlite;
                return true;
            case "postgres" or "postgresql" or "npgsql":
                provider = DatabaseProvider.Postgres;
                return true;
            default:
                provider = default;
                return false;
        }
    }

    public static string MigrationsAssembly(DatabaseProvider provider) => $"Strata.Migrations.{provider}";

    public static void Use(DbContextOptionsBuilder options, DatabaseProvider provider, string connectionString)
    {
        var migrations = MigrationsAssembly(provider);
        switch (provider)
        {
            case DatabaseProvider.Sqlite:
                options.UseSqlite(connectionString, o => o.MigrationsAssembly(migrations));
                break;
            case DatabaseProvider.Postgres:
                options.UseNpgsql(connectionString, o => o.MigrationsAssembly(migrations));
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(provider), provider, null);
        }
    }
}
