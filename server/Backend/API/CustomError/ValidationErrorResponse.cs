using Microsoft.AspNetCore.Mvc;

namespace API.CustomError;

public static class ValidationErrorResponse
{
    /// <summary>Validation failures keep the Node server's body shape: { "error": "&lt;first problem&gt;" }.</summary>
    public static IActionResult Create(ActionContext context)
    {
        var message = "bad request";
        foreach (var entry in context.ModelState.Values)
        {
            if (entry.Errors.Count > 0)
            {
                message = entry.Errors[0].ErrorMessage;
                break;
            }
        }

        return new BadRequestObjectResult(new { error = message });
    }
}
