using System.Text.Json;

namespace Strata.Server.Live;

/// <summary>
/// One change to a diagram. A batch of these is sent with <c>Apply</c> and every member of the room, the sender included, receives the accepted batch
/// as <c>Ops</c>. Operations act on whole entities: two people changing different entities never conflict, and two changing the same one are resolved
/// in the order the server received them (last write wins).
/// </summary>
/// <param name="Op"><c>put</c> adds the entity or replaces it with <c>Item</c>; <c>del</c> removes <c>Id</c>; <c>name</c> renames the diagram; <c>style</c> replaces the diagram's connector defaults with <c>Item</c>.</param>
/// <param name="Kind"><c>node</c>, <c>connector</c> or <c>zone</c>. Required for <c>put</c> and <c>del</c>.</param>
/// <param name="Id">The entity to delete. Required for <c>del</c>.</param>
/// <param name="Item">The complete entity as stored in the diagram, validated with the same rules as saving. Required for <c>put</c>. For <c>style</c>, the whole <c>style</c> object.</param>
/// <param name="Name">The new diagram name, at most 200 characters. Required for <c>name</c>.</param>
public record LiveOp(string Op, string? Kind, string? Id, JsonElement? Item, string? Name);

/// <summary>Someone who has the diagram open.</summary>
/// <param name="ConnectionId">Identifies this tab. The same account in two tabs appears twice.</param>
/// <param name="UserId">The account, or null when accounts are off.</param>
/// <param name="Name">The account's display name, or "Guest n" when accounts are off.</param>
/// <param name="Color">A CSS colour that stays the same for as long as the person is in the room.</param>
/// <param name="CanEdit">False for viewers: they see everything live but cannot send changes.</param>
public record Peer(string ConnectionId, string? UserId, string Name, string Color, bool CanEdit);

/// <summary>What <c>Join</c> returns: the current state to start from, and who is already here.</summary>
/// <param name="Rev">Counts accepted batches since the room opened; only ever grows.</param>
/// <param name="Name">The diagram's current name.</param>
/// <param name="Data">The diagram document as it is right now, including edits not yet saved to the database.</param>
/// <param name="Role"><c>owner</c>, <c>editor</c> or <c>viewer</c>.</param>
/// <param name="You">The caller's own entry in the room.</param>
/// <param name="Peers">Everyone else in the room.</param>
public record JoinResult(long Rev, string Name, JsonElement Data, string Role, Peer You, IReadOnlyList<Peer> Peers);
