using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace Strata.Data;

public partial class StrataDbContext(DbContextOptions<StrataDbContext> options) : DbContext(options)
{
    // SQL Server compares text case-insensitively by default, which would make two view tokens that differ only in case the same token.
    private const string CaseSensitive = "Latin1_General_100_BIN2";

    public DbSet<Diagram> Diagrams => Set<Diagram>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Diagram>(e =>
        {
            e.ToTable("diagrams");
            e.HasKey(d => d.Id);
            e.Property(d => d.Id).HasMaxLength(64);
            e.Property(d => d.ViewToken).HasMaxLength(32);
            e.Property(d => d.Name).HasMaxLength(200);
            e.HasIndex(d => d.ViewToken).IsUnique();
            e.HasIndex(d => d.UpdatedAt);

            if (Database.IsSqlServer())
            {
                e.Property(d => d.Id).UseCollation(CaseSensitive);
                e.Property(d => d.ViewToken).UseCollation(CaseSensitive);
            }
        });

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                property.SetColumnName(SnakeCase(property.Name));
    }

    private static string SnakeCase(string name) => Boundary().Replace(name, "$1_$2").ToLowerInvariant();

    [GeneratedRegex("([a-z0-9])([A-Z])")]
    private static partial Regex Boundary();
}
