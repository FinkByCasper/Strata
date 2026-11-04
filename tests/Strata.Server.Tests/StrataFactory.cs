using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Data.SqlClient;
using Npgsql;
using Strata.Data;

namespace Strata.Server.Tests;

public static class TestDatabase
{
    public static DatabaseProvider Provider { get; } =
        DatabaseConfiguration.TryParse(Environment.GetEnvironmentVariable("STRATA_TEST_PROVIDER"), out var provider)
            ? provider
            : throw new InvalidOperationException("STRATA_TEST_PROVIDER must be sqlite, postgres or sqlserver");

    public static string AdminConnection { get; } = Environment.GetEnvironmentVariable("STRATA_TEST_CONNECTION") ?? "";

    public static bool IsSqlite => Provider == DatabaseProvider.Sqlite;

    public static string Create(string name)
    {
        switch (Provider)
        {
            case DatabaseProvider.Postgres:
                Run(new NpgsqlConnection(AdminConnection), $"CREATE DATABASE \"{name}\"");
                return new NpgsqlConnectionStringBuilder(AdminConnection) { Database = name, Pooling = false }.ConnectionString;
            case DatabaseProvider.SqlServer:
                Run(new SqlConnection(AdminConnection), $"CREATE DATABASE [{name}]");
                return new SqlConnectionStringBuilder(AdminConnection) { InitialCatalog = name, Pooling = false }.ConnectionString;
            default:
                throw new NotSupportedException();
        }
    }

    public static void Drop(string name)
    {
        switch (Provider)
        {
            case DatabaseProvider.Postgres:
                Run(new NpgsqlConnection(AdminConnection), $"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)");
                break;
            case DatabaseProvider.SqlServer:
                Run(new SqlConnection(AdminConnection), $"ALTER DATABASE [{name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{name}]");
                break;
        }
    }

    private static void Run(System.Data.Common.DbConnection connection, string sql)
    {
        using (connection)
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = sql;
            command.ExecuteNonQuery();
        }
    }
}

public sealed class StrataFactory : WebApplicationFactory<Program>
{
    private readonly string dir = Directory.CreateTempSubdirectory("strata-test-").FullName;
    private readonly string databaseName = $"strata_test_{Guid.NewGuid():N}";
    private readonly string? connection;

    public StrataFactory()
    {
        if (!TestDatabase.IsSqlite) connection = TestDatabase.Create(databaseName);
    }

    public string? Dist { get; init; } = "/definitely/not/here";

    public string DatabasePath => Path.Combine(dir, "strata.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(l => l.SetMinimumLevel(LogLevel.Warning));
        if (TestDatabase.IsSqlite)
        {
            builder.UseSetting("STRATA_DB", DatabasePath);
        }
        else
        {
            builder.UseSetting("STRATA_DB_PROVIDER", TestDatabase.Provider.ToString());
            builder.UseSetting("STRATA_DB_CONNECTION", connection);
        }
        if (Dist is not null) builder.UseSetting("STRATA_DIST", Dist);
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing) return;
        SqliteConnection.ClearAllPools();
        NpgsqlConnection.ClearAllPools();
        SqlConnection.ClearAllPools();
        if (!TestDatabase.IsSqlite) TestDatabase.Drop(databaseName);
        try { Directory.Delete(dir, true); } catch (IOException) { }
    }
}

public static class Samples
{
    public static readonly object Empty = new { nodes = Array.Empty<object>(), connectors = Array.Empty<object>(), zones = Array.Empty<object>() };

    public static object Node(string id = "a") => new { id, label = id.ToUpperInvariant(), description = "", shape = "box", color = "#4f8cff", position = new[] { 0, 0, 0 } };

    public static object WithNodes(params object[] nodes) => new { nodes, connectors = Array.Empty<object>(), zones = Array.Empty<object>() };
}

public static class HttpExtensions
{
    public static Task<HttpResponseMessage> SendJson(this HttpClient http, HttpMethod method, string url, object? body = null) =>
        http.SendAsync(new HttpRequestMessage(method, url) { Content = JsonContent.Create(body ?? new { }) });

    public static async Task<JsonElement> Body(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>());
}
