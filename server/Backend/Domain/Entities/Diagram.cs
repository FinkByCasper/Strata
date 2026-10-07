using Domain.Models;

namespace Domain.Entities;

public class Diagram
{
    public required string Id { get; set; }
    public required string ViewToken { get; set; }
    public required string Name { get; set; }
    public required DiagramData Data { get; set; }

    /// <summary>Unix epoch milliseconds, matching the original Node server's schema.</summary>
    public long CreatedAt { get; set; }
    public long UpdatedAt { get; set; }
}
