using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Services.Data;

namespace Services;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddStrataServices(this IServiceCollection services, string dbFile)
    {
        if (dbFile != ":memory:")
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(dbFile));
            if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        }
        services.AddDbContext<StrataDbContext>(o => o.UseSqlite($"Data Source={dbFile}"));
        services.AddScoped<IDiagramService, DiagramService>();
        return services;
    }

    /// <summary>Creates the schema if missing (CREATE TABLE IF NOT EXISTS semantics, like the Node server).</summary>
    public static void EnsureStrataDatabase(this IServiceProvider provider)
    {
        using var scope = provider.CreateScope();
        scope.ServiceProvider.GetRequiredService<StrataDbContext>().Database.EnsureCreated();
    }
}
