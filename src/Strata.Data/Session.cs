namespace Strata.Data;

public class Session
{
    public required string TokenHash { get; set; }
    public required string UserId { get; set; }
    public long CreatedAt { get; set; }
    public long ExpiresAt { get; set; }
}
