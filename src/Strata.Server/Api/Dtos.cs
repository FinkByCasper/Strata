using System.Text.Json;
using Strata.Data;

namespace Strata.Server.Api;

/// <summary>A row on the diagram list. Carries no diagram data, so listing stays cheap however large the diagrams are.</summary>
/// <param name="Id">The editing id.</param>
/// <param name="Name">Display name.</param>
/// <param name="UpdatedAt">Unix time in milliseconds; changes on every save.</param>
/// <param name="Role">What the caller may do: <c>owner</c>, <c>editor</c> or <c>viewer</c>. Always <c>owner</c> when accounts are switched off.</param>
/// <param name="OwnerName">Display name of the owner when the diagram was shared with the caller; null for the caller's own diagrams.</param>
public record DiagramSummary(string Id, string Name, long UpdatedAt, string Role, string? OwnerName);

/// <summary>A diagram as the editor receives it. <c>ViewToken</c> is a secret: anyone holding it can read the diagram through the shared endpoint.</summary>
/// <param name="Id">The editing id. Never exposed through the shared endpoint.</param>
/// <param name="ViewToken">Token for the public read-only link; replaced when the link is regenerated. Null unless the caller is the owner.</param>
/// <param name="Name">Display name, at most 200 characters.</param>
/// <param name="Data">The diagram document (<c>nodes</c>, <c>connectors</c>, <c>zones</c>), stored and returned exactly as the client sent it.</param>
/// <param name="CreatedAt">Unix time in milliseconds.</param>
/// <param name="UpdatedAt">Unix time in milliseconds; changes on every save.</param>
/// <param name="Role">What the caller may do: <c>owner</c>, <c>editor</c> (can save) or <c>viewer</c> (read only).</param>
public record DiagramResponse(string Id, string? ViewToken, string Name, JsonElement Data, long CreatedAt, long UpdatedAt, string Role);

/// <summary>What a view-only link or embed receives: the content, never the editing id or the view token.</summary>
public record SharedDiagramResponse(string Name, JsonElement Data, long UpdatedAt);

/// <summary>Request body for creating or saving a diagram. When creating, both fields are optional and default to "Untitled diagram" and an empty diagram. When saving, both are required.</summary>
/// <param name="Name">Display name, at most 200 characters.</param>
/// <param name="Data">Must pass diagram validation: arrays of nodes, connectors and zones with known shapes and routes, connectors that point at existing nodes, and size limits.</param>
public record DiagramInput(string? Name, JsonElement? Data);

/// <summary>Returned after the view link is regenerated. The previous token stops working immediately.</summary>
public record ViewTokenResponse(string ViewToken);

/// <summary>Every failed request returns this body with a matching HTTP status.</summary>
public record ErrorResponse(string Error);

/// <summary>A backup of diagrams that <c>POST /api/import</c> accepts. It keeps ids and view tokens, so existing share links survive a move.</summary>
/// <param name="Format">Always <c>strata-export</c>.</param>
/// <param name="Version">Format version; currently 1.</param>
/// <param name="ExportedAt">Unix time in milliseconds when the file was produced.</param>
/// <param name="Diagrams">Every diagram, oldest first.</param>
public record ExportFile(string Format, int Version, long ExportedAt, IReadOnlyList<ExportedDiagram> Diagrams);

/// <summary>One diagram inside an export file.</summary>
/// <param name="Id">Editing id; letters, digits, <c>_</c> and <c>-</c>, at most 64 characters.</param>
/// <param name="ViewToken">Kept on import unless another diagram already uses it, in which case a new one is issued.</param>
/// <param name="Name">Display name, at most 200 characters.</param>
/// <param name="Data">The diagram document; validated with the same rules as saving.</param>
/// <param name="CreatedAt">Unix time in milliseconds; filled in with the import time when missing.</param>
/// <param name="UpdatedAt">Unix time in milliseconds; filled in with the import time when missing.</param>
public record ExportedDiagram(string Id, string? ViewToken, string Name, JsonElement Data, long? CreatedAt, long? UpdatedAt);

/// <summary>Outcome of an import. A rejected diagram never stops the others from being imported.</summary>
/// <param name="Imported">New diagrams created.</param>
/// <param name="Replaced">Existing diagrams overwritten; only happens with <c>overwrite=true</c>.</param>
/// <param name="Skipped">Diagrams left alone because their id already exists.</param>
/// <param name="Rejected">Diagrams that failed validation, with the reason.</param>
public record ImportResult(int Imported, int Replaced, int Skipped, IReadOnlyList<RejectedDiagram> Rejected);

/// <summary>A diagram an import refused.</summary>
public record RejectedDiagram(string? Id, string? Name, string Error);

/// <summary>The signed-in person. Never contains anything secret.</summary>
public record UserResponse(string Id, string Email, string DisplayName);

/// <summary>What the web app asks first to decide between showing the sign-in page and the diagram list.</summary>
/// <param name="AuthEnabled">False when the server runs with <c>STRATA_AUTH=off</c>; then nothing needs signing in.</param>
/// <param name="SignupOpen">Whether the sign-in page may offer "create account". Always true for the very first account.</param>
/// <param name="User">The signed-in person, or null when there is no valid session.</param>
public record SessionResponse(bool AuthEnabled, bool SignupOpen, UserResponse? User);

/// <summary>Credentials for signing in. Failures never say which of the two was wrong.</summary>
public record LoginInput(string? Email, string? Password);

/// <summary>Request body for creating an account; the new account is signed in immediately.</summary>
/// <param name="Email">Used to sign in and to be found when a diagram is shared. Stored lower-cased.</param>
/// <param name="Password">10 to 128 characters. Stored only as a salted hash.</param>
/// <param name="DisplayName">Shown to people the account shares with; defaults to the part of the email before the @.</param>
public record RegisterInput(string? Email, string? Password, string? DisplayName);

/// <summary>Request body for sharing a diagram with another account.</summary>
/// <param name="Email">Email of an existing account.</param>
/// <param name="Role"><c>viewer</c> can read; <c>editor</c> can also save changes and restore versions. Sharing again with the same account changes its role.</param>
public record ShareInput(string? Email, ShareRole? Role);

/// <summary>One account a diagram is shared with.</summary>
public record ShareResponse(string UserId, string Email, string DisplayName, ShareRole Role);
