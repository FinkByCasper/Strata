using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Strata.Data;

namespace Strata.Migrations.Postgres;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<StrataDbContext>
{
    public StrataDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<StrataDbContext>();
        DatabaseConfiguration.Use(options, DatabaseProvider.Postgres, "Host=localhost;Database=strata-design-time");
        return new StrataDbContext(options.Options);
    }
}
