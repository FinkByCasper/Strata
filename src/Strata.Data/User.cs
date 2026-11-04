namespace Strata.Data;

public class User
{
    public required string Id { get; set; }
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public required string PasswordHash { get; set; }
    public long CreatedAt { get; set; }
}
