using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.AspNetCore.Hosting;

namespace API.Tests;

/// <summary>
/// The API on a throwaway SQLite file, so every test class gets a fresh database.
/// A file rather than ":memory:" because each request's DbContext opens its own connection.
/// </summary>
public sealed class StrataApp : WebApplicationFactory<Program>
{
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"strata-test-{Guid.NewGuid():N}.db");
    private readonly string _dist;

    /// <param name="dist">Where the built web app is expected; defaults to a folder that does not exist.</param>
    public StrataApp(string? dist = null)
    {
        _dist = dist ?? Path.Combine(Path.GetTempPath(), $"strata-no-dist-{Guid.NewGuid():N}");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("STRATA_DB", _dbFile);
        builder.UseSetting("STRATA_DIST", _dist);
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (!disposing)
        {
            return;
        }

        SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch (IOException) { /* temp file, the OS will get it */ }
    }
}
