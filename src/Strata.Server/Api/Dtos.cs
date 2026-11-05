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
/// <param name="Models">Models the diagram's nodes use. Optional: files made before models existed have none.</param>
public record ExportedDiagram(string Id, string? ViewToken, string Name, JsonElement Data, long? CreatedAt, long? UpdatedAt, IReadOnlyList<ExportedModel>? Models = null);

/// <summary>A 3D model bundled into an export, so the diagram still shows it after a move.</summary>
/// <param name="Id">The id nodes refer to with <c>modelId</c>; letters, digits, <c>_</c> and <c>-</c>.</param>
/// <param name="Name">Original file name.</param>
/// <param name="Data">The file, base64 encoded. It is checked on import exactly like an upload.</param>
public record ExportedModel(string Id, string Name, string Data);

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

/// <summary>One entry in a diagram's history. Carries no content, so the list stays small however large the diagrams are.</summary>
/// <param name="Id">Id to restore, fetch or delete this version with.</param>
/// <param name="SavedAt">Unix time in milliseconds of the state this version holds, not of when the copy was made: an automatic version of yesterday's work says yesterday.</param>
/// <param name="Kind"><c>auto</c> taken by the server just before a save replaced the state, <c>manual</c> saved by a person and never pruned, <c>restore</c> taken just before a restore so the restore can be undone.</param>
/// <param name="Label">Name given to a manual version; null otherwise.</param>
/// <param name="AuthorName">Who saved the state this version holds; null when accounts are off.</param>
/// <param name="Name">The diagram's name in that state.</param>
/// <param name="Nodes">Number of nodes, to tell versions apart at a glance.</param>
/// <param name="Connectors">Number of connectors.</param>
/// <param name="Zones">Number of zones.</param>
public record VersionSummary(string Id, long SavedAt, VersionKind Kind, string? Label, string? AuthorName, string Name, int Nodes, int Connectors, int Zones);

/// <summary>A version with its content, for looking at it before restoring.</summary>
/// <param name="Id">Id of the version.</param>
/// <param name="SavedAt">Unix time in milliseconds of the state.</param>
/// <param name="Kind">How the version came to be.</param>
/// <param name="Label">Name of a manual version.</param>
/// <param name="AuthorName">Who saved the state.</param>
/// <param name="Name">The diagram's name in that state.</param>
/// <param name="Nodes">Number of nodes.</param>
/// <param name="Connectors">Number of connectors.</param>
/// <param name="Zones">Number of zones.</param>
/// <param name="Data">The diagram document exactly as it was saved.</param>
public record VersionResponse(string Id, long SavedAt, VersionKind Kind, string? Label, string? AuthorName, string Name, int Nodes, int Connectors, int Zones, JsonElement Data);

/// <summary>Request body for saving a named version of the diagram as it is now.</summary>
/// <param name="Label">Optional name, at most 200 characters.</param>
public record VersionInput(string? Label);

/// <summary>A 3D model stored with a diagram. Nodes use it through <c>modelId</c>; the file itself comes from the download endpoint.</summary>
/// <param name="Id">Identifies the model within its diagram.</param>
/// <param name="Name">Original file name, for display.</param>
/// <param name="Format"><c>glb</c> (binary) or <c>gltf</c> (JSON with everything embedded).</param>
/// <param name="Size">Bytes.</param>
/// <param name="Sha256">Hex digest of the file; uploading the same file twice to one diagram returns the existing model.</param>
/// <param name="CreatedAt">Unix time in milliseconds.</param>
public record ModelResponse(string Id, string Name, ModelFormat Format, long Size, string Sha256, long CreatedAt);
