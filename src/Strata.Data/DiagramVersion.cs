namespace Strata.Data;

public enum VersionKind
{
    Auto,
    Manual,
    Restore,
}

public class DiagramVersion
{
    public required string Id { get; set; }
    public required string DiagramId { get; set; }
    public string? AuthorId { get; set; }
    public required string Name { get; set; }
    public required string Data { get; set; }
    public VersionKind Kind { get; set; }
    public string? Label { get; set; }
    public required string ContentHash { get; set; }
    public int NodeCount { get; set; }
    public int ConnectorCount { get; set; }
    public int ZoneCount { get; set; }
    public long SavedAt { get; set; }
    public long CreatedAt { get; set; }
}
