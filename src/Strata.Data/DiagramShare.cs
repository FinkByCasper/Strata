namespace Strata.Data;

public enum ShareRole
{
    Viewer,
    Editor,
}

public class DiagramShare
{
    public required string DiagramId { get; set; }
    public required string UserId { get; set; }
    public ShareRole Role { get; set; }
    public long CreatedAt { get; set; }
}
