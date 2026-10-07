using Domain.Entities;
using Domain.Models;

namespace Services;

public interface IDiagramService
{
    /// <summary>All diagrams, most recently updated first, without their data.</summary>
    Task<List<DiagramSummary>> ListAsync(CancellationToken ct = default);
    Task<Diagram?> GetAsync(string id, CancellationToken ct = default);
    Task<Diagram?> GetByTokenAsync(string viewToken, CancellationToken ct = default);
    Task<Diagram> CreateAsync(string name, DiagramData data, CancellationToken ct = default);
    /// <returns>The saved diagram, or null if it does not exist.</returns>
    Task<Diagram?> SaveAsync(string id, string name, DiagramData data, CancellationToken ct = default);
    /// <returns>The new view token, or null if the diagram does not exist.</returns>
    Task<string?> RotateViewTokenAsync(string id, CancellationToken ct = default);
    Task<bool> DeleteAsync(string id, CancellationToken ct = default);
}
