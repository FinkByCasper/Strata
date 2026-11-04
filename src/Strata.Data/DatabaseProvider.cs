using Microsoft.EntityFrameworkCore;

namespace Strata.Data;

public enum DatabaseProvider
{
    Sqlite,
}

public static class DatabaseConfiguration
{
    public static string MigrationsAssembly(DatabaseProvider provider) => $"Strata.Migrations.{provider}";

    public static void Use(DbContextOptionsBuilder options, DatabaseProvider provider, string connectionString)
    {
        var migrations = MigrationsAssembly(provider);
        switch (provider)
        {
            case DatabaseProvider.Sqlite:
                options.UseSqlite(connectionString, o => o.MigrationsAssembly(migrations));
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(provider), provider, null);
        }
    }
}
