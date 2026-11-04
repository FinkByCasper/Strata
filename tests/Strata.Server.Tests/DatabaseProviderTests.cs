using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Strata.Data;

namespace Strata.Server.Tests;

public class DatabaseProviderTests
{
    [Theory]
    [InlineData(DatabaseProvider.Sqlite)]
    [InlineData(DatabaseProvider.Postgres)]
    public void Each_engine_has_migrations_that_match_the_model(DatabaseProvider provider)
    {
        var options = new DbContextOptionsBuilder<StrataDbContext>();
        DatabaseConfiguration.Use(options, provider, provider == DatabaseProvider.Sqlite ? "Data Source=unused.db" : "Host=unused;Database=unused");
        using var db = new StrataDbContext(options.Options);

        Assert.NotEmpty(db.Database.GetMigrations());
        Assert.False(db.Database.HasPendingModelChanges(), $"The {provider} migrations are behind the model: add a migration to src/Strata.Migrations.{provider}.");
    }

    [Theory]
    [InlineData(null, DatabaseProvider.Sqlite)]
    [InlineData("", DatabaseProvider.Sqlite)]
    [InlineData("SQLite", DatabaseProvider.Sqlite)]
    [InlineData("postgres", DatabaseProvider.Postgres)]
    [InlineData("PostgreSQL", DatabaseProvider.Postgres)]
    public void Provider_names_are_forgiving(string? name, DatabaseProvider expected)
    {
        Assert.True(DatabaseConfiguration.TryParse(name, out var provider));
        Assert.Equal(expected, provider);
    }

    private static StrataSettings Settings(params (string Key, string Value)[] values) =>
        StrataSettings.From(
            new ConfigurationBuilder().AddInMemoryCollection(values.ToDictionary(v => v.Key, v => (string?)v.Value)).Build(),
            new FakeEnvironment(),
            []);

    [Fact]
    public void Sqlite_is_the_default_and_uses_the_database_path()
    {
        var path = Path.Combine(Path.GetTempPath(), $"strata-settings-{Guid.NewGuid():N}", "strata.db");
        try
        {
            var settings = Settings(("STRATA_DB", path));
            Assert.Equal(DatabaseProvider.Sqlite, settings.Provider);
            Assert.Equal($"Data Source={path}", settings.ConnectionString);
        }
        finally { Directory.Delete(Path.GetDirectoryName(path)!, true); }
    }

    [Fact]
    public void Postgres_takes_its_connection_string_from_the_environment()
    {
        var settings = Settings(("STRATA_DB_PROVIDER", "postgres"), ("STRATA_DB_CONNECTION", "Host=db;Database=strata"));
        Assert.Equal(DatabaseProvider.Postgres, settings.Provider);
        Assert.Equal("Host=db;Database=strata", settings.ConnectionString);
        Assert.Equal("Postgres", settings.DatabaseLabel);
    }

    [Fact]
    public void A_server_database_without_a_connection_string_fails_with_an_instruction()
    {
        var error = Assert.Throws<InvalidOperationException>(() => Settings(("STRATA_DB_PROVIDER", "postgres")));
        Assert.Contains("STRATA_DB_CONNECTION", error.Message);
    }

    [Fact]
    public void An_unknown_provider_fails_naming_the_value()
    {
        var error = Assert.Throws<InvalidOperationException>(() => Settings(("STRATA_DB_PROVIDER", "oracle")));
        Assert.Contains("'oracle'", error.Message);
    }

    [Fact]
    public async Task View_tokens_that_differ_only_by_case_are_different_tokens()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();
        var file = new
        {
            format = "strata-export",
            version = 1,
            diagrams = new[]
            {
                new { id = "lower", viewToken = "abcdefghijklmnopqrstuv", name = "lower", data = Samples.Empty },
                new { id = "upper", viewToken = "ABCDEFGHIJKLMNOPQRSTUV", name = "upper", data = Samples.Empty },
            },
        };
        Assert.Equal(2, (await (await http.SendJson(HttpMethod.Post, "/api/import", file)).Body()).GetProperty("imported").GetInt32());

        Assert.Equal("lower", (await http.GetFromJsonAsync<JsonElement>("/api/shared/abcdefghijklmnopqrstuv")).GetProperty("name").GetString());
        Assert.Equal("upper", (await http.GetFromJsonAsync<JsonElement>("/api/shared/ABCDEFGHIJKLMNOPQRSTUV")).GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/shared/AbCdEfGhIjKlMnOpQrStUv")).StatusCode);
    }

    private sealed class FakeEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Testing";
        public string ApplicationName { get; set; } = "Strata";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
