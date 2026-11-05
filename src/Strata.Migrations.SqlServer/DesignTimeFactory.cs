using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Strata.Data;

namespace Strata.Migrations.SqlServer;

public sealed class DesignTimeFactory : IDesignTimeDbContextFactory<StrataDbContext>
{
    public StrataDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<StrataDbContext>();
        DatabaseConfiguration.Use(options, DatabaseProvider.SqlServer, "Server=localhost;Database=strata-design-time");
        return new StrataDbContext(options.Options);
    }
}
