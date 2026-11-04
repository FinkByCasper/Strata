using Microsoft.EntityFrameworkCore;
using Strata.Data;

namespace Strata.Server.Storage;

public static class LegacyDatabase
{
    public static async Task AdoptAsync(StrataDbContext db)
    {
        if (!db.Database.IsSqlite()) return;

        await db.Database.OpenConnectionAsync();
        try
        {
            var connection = db.Database.GetDbConnection();
            if (!await Exists(connection, "diagrams") || await Exists(connection, "__EFMigrationsHistory")) return;

            var baseline = db.Database.GetMigrations().First();
            var version = typeof(DbContext).Assembly.GetName().Version!.ToString(3);
            await db.Database.ExecuteSqlRawAsync("CREATE TABLE \"__EFMigrationsHistory\" (\"MigrationId\" TEXT NOT NULL CONSTRAINT \"PK___EFMigrationsHistory\" PRIMARY KEY, \"ProductVersion\" TEXT NOT NULL)");
            await db.Database.ExecuteSqlAsync($"INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES ({baseline}, {version})");
            await db.Database.ExecuteSqlRawAsync("CREATE INDEX IF NOT EXISTS \"IX_diagrams_updated_at\" ON \"diagrams\" (\"updated_at\")");
        }
        finally
        {
            await db.Database.CloseConnectionAsync();
        }
    }

    private static async Task<bool> Exists(System.Data.Common.DbConnection connection, string table)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = $name";
        var parameter = command.CreateParameter();
        parameter.ParameterName = "$name";
        parameter.Value = table;
        command.Parameters.Add(parameter);
        return await command.ExecuteScalarAsync() is not null;
    }
}
