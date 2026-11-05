using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace Strata.Data;

public partial class StrataDbContext(DbContextOptions<StrataDbContext> options) : DbContext(options)
{
    // SQL Server compares text case-insensitively by default, which would make two view tokens that differ only in case the same token.
    private const string CaseSensitive = "Latin1_General_100_BIN2";

    public DbSet<Diagram> Diagrams => Set<Diagram>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<DiagramShare> Shares => Set<DiagramShare>();
    public DbSet<DiagramVersion> Versions => Set<DiagramVersion>();
    public DbSet<ModelAsset> Models => Set<ModelAsset>();

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
            e.Property(d => d.OwnerId).HasMaxLength(64);
            e.Property(d => d.UpdatedById).HasMaxLength(64);
            e.HasIndex(d => d.UpdatedAt);
            e.HasIndex(d => d.OwnerId);
            e.HasOne<User>().WithMany().HasForeignKey(d => d.OwnerId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(u => u.Id);
            e.Property(u => u.Id).HasMaxLength(64);
            e.Property(u => u.Email).HasMaxLength(254);
            e.Property(u => u.DisplayName).HasMaxLength(80);
            e.Property(u => u.PasswordHash).HasMaxLength(256);
            e.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Session>(e =>
        {
            e.ToTable("sessions");
            e.HasKey(s => s.TokenHash);
            e.Property(s => s.TokenHash).HasMaxLength(64);
            e.Property(s => s.UserId).HasMaxLength(64);
            e.HasIndex(s => s.ExpiresAt);
            e.HasOne<User>().WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiagramShare>(e =>
        {
            e.ToTable("diagram_shares");
            e.HasKey(s => new { s.DiagramId, s.UserId });
            e.Property(s => s.DiagramId).HasMaxLength(64);
            e.Property(s => s.UserId).HasMaxLength(64);
            e.Property(s => s.Role).HasMaxLength(10).HasConversion(r => r.ToString().ToLowerInvariant(), r => Enum.Parse<ShareRole>(r, true));
            e.HasIndex(s => s.UserId);
            e.HasOne<Diagram>().WithMany().HasForeignKey(s => s.DiagramId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiagramVersion>(e =>
        {
            e.ToTable("diagram_versions");
            e.HasKey(v => v.Id);
            e.Property(v => v.Id).HasMaxLength(64);
            e.Property(v => v.DiagramId).HasMaxLength(64);
            e.Property(v => v.AuthorId).HasMaxLength(64);
            e.Property(v => v.Name).HasMaxLength(200);
            e.Property(v => v.Label).HasMaxLength(200);
            e.Property(v => v.ContentHash).HasMaxLength(64);
            e.Property(v => v.Kind).HasMaxLength(10).HasConversion(k => k.ToString().ToLowerInvariant(), k => Enum.Parse<VersionKind>(k, true));
            e.HasIndex(v => new { v.DiagramId, v.SavedAt });
            e.HasOne<Diagram>().WithMany().HasForeignKey(v => v.DiagramId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne<User>().WithMany().HasForeignKey(v => v.AuthorId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<ModelAsset>(e =>
        {
            e.ToTable("model_assets");
            e.HasKey(m => new { m.DiagramId, m.Id });
            e.Property(m => m.DiagramId).HasMaxLength(64);
            e.Property(m => m.Id).HasMaxLength(64);
            e.Property(m => m.Name).HasMaxLength(120);
            e.Property(m => m.Sha256).HasMaxLength(64);
            e.Property(m => m.Format).HasMaxLength(10).HasConversion(f => f.ToString().ToLowerInvariant(), f => Enum.Parse<ModelFormat>(f, true));
            e.HasIndex(m => new { m.DiagramId, m.Sha256 });
            e.HasOne<Diagram>().WithMany().HasForeignKey(m => m.DiagramId).OnDelete(DeleteBehavior.Cascade);
        });

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(SnakeCase(property.Name));
                if (Database.IsSqlServer() && property.ClrType == typeof(string) && (property.IsKey() || property.IsForeignKey() || property.Name is "ViewToken"))
                    property.SetCollation(CaseSensitive);
            }
    }

    private static string SnakeCase(string name) => Boundary().Replace(name, "$1_$2").ToLowerInvariant();

    [GeneratedRegex("([a-z0-9])([A-Z])")]
    private static partial Regex Boundary();
}
