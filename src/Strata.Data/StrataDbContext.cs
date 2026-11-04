using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace Strata.Data;

public partial class StrataDbContext(DbContextOptions<StrataDbContext> options) : DbContext(options)
{
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
        });

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                property.SetColumnName(SnakeCase(property.Name));
    }

    private static string SnakeCase(string name) => Boundary().Replace(name, "$1_$2").ToLowerInvariant();

    [GeneratedRegex("([a-z0-9])([A-Z])")]
    private static partial Regex Boundary();
}
