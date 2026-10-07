using System.ComponentModel.DataAnnotations;
using Domain.Models;
using Microsoft.AspNetCore.Mvc;
using Services;

namespace API.Controllers;

// Editor API: open to anyone who can reach the server (put it behind your own proxy / VPN if that matters);
// sharing with others is via the view token.
[ApiController]
[Route("api/diagrams")]
[RequestSizeLimit(4 * 1024 * 1024)]
public class DiagramController(IDiagramService diagrams) : ControllerBase
{
    public class DiagramRequest
    {
        [StringLength(200)] public string? Name { get; set; }
        public DiagramData? Data { get; set; }
    }

    private IActionResult NotFoundError()
    {
        return NotFound(new { error = "not found" });
    }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        return Ok(await diagrams.ListAsync(ct));
    }

    [HttpPost]
    public async Task<IActionResult> Post([FromBody] DiagramRequest? body, CancellationToken ct)
    {
        // A missing name or data falls back to a default.
        var name = body?.Name ?? "Untitled diagram";
        var data = body?.Data ?? DiagramData.Empty();

        var created = await diagrams.CreateAsync(name, data, ct);
        return Created($"/api/diagrams/{created.Id}", created);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id, CancellationToken ct)
    {
        var diagram = await diagrams.GetAsync(id, ct);
        if (diagram is null)
        {
            return NotFoundError();
        }

        return Ok(diagram);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Put(string id, [FromBody] DiagramRequest? body, CancellationToken ct)
    {
        if (body?.Name is null || body.Data is null)
        {
            return BadRequest(new { error = "name and data are required" });
        }

        var saved = await diagrams.SaveAsync(id, body.Name, body.Data, ct);
        if (saved is null)
        {
            return NotFoundError();
        }

        return Ok(saved);
    }

    [HttpPost("{id}/rotate-view-token")]
    public async Task<IActionResult> RotateViewToken(string id, CancellationToken ct)
    {
        var token = await diagrams.RotateViewTokenAsync(id, ct);
        if (token is null)
        {
            return NotFoundError();
        }

        return Ok(new { viewToken = token });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id, CancellationToken ct)
    {
        var deleted = await diagrams.DeleteAsync(id, ct);
        if (!deleted)
        {
            return NotFoundError();
        }

        return NoContent();
    }

    // Public read-only endpoint: exposes name + data only, never the edit id.
    // The route is absolute (~/) so it stays /api/shared/{token}, which is what the web app calls.
    [HttpGet("~/api/shared/{token}")]
    public async Task<IActionResult> GetShared(string token, CancellationToken ct)
    {
        var diagram = await diagrams.GetByTokenAsync(token, ct);
        if (diagram is null)
        {
            return NotFoundError();
        }

        return Ok(new { diagram.Name, diagram.Data, diagram.UpdatedAt });
    }
}
