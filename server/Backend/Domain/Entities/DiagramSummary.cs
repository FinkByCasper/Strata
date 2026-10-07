namespace Domain.Entities;

/// <summary>A diagram without its data, for the list view.</summary>
public record DiagramSummary(string Id, string Name, long UpdatedAt);
