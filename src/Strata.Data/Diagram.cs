namespace Strata.Data;

public class Diagram
{
    public required string Id { get; set; }
    public required string ViewToken { get; set; }
    public required string Name { get; set; }
    public required string Data { get; set; }
    public string? OwnerId { get; set; }
    public string? UpdatedById { get; set; }
    public long CreatedAt { get; set; }
    public long UpdatedAt { get; set; }
}
