using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Strata.Data;

namespace Strata.Migrations.Sqlite;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<StrataDbContext>
{
    public StrataDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<StrataDbContext>();
        DatabaseConfiguration.Use(options, DatabaseProvider.Sqlite, "Data Source=design-time.db");
        return new StrataDbContext(options.Options);
    }
}
