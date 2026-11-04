namespace Strata.Server.Api;

public sealed class ErrorMiddleware(RequestDelegate next, ILogger<ErrorMiddleware> log)
{
    public async Task Invoke(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (Exception e) when (!ctx.Response.HasStarted)
        {
            var (status, message) = e switch
            {
                ApiException a => (a.Status, a.Message),
                BadHttpRequestException b when b.StatusCode == StatusCodes.Status413PayloadTooLarge => (413, "request entity too large"),
                BadHttpRequestException b => (b.StatusCode, "bad request"),
                OperationCanceledException => (StatusCodes.Status499ClientClosedRequest, "request cancelled"),
                _ => (500, "internal error"),
            };
            if (status == 500) log.LogError(e, "Unhandled exception");
            ctx.Response.Clear();
            ctx.Response.StatusCode = status;
            await ctx.Response.WriteAsJsonAsync(new ErrorResponse(message));
        }
    }
}
