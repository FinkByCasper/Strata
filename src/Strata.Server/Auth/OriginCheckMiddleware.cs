using Strata.Server.Api;

namespace Strata.Server.Auth;

public sealed class OriginCheckMiddleware(RequestDelegate next, AuthSettings auth)
{
    public async Task Invoke(HttpContext ctx)
    {
        var request = ctx.Request;
        var unsafeMethod = !HttpMethods.IsGet(request.Method) && !HttpMethods.IsHead(request.Method) && !HttpMethods.IsOptions(request.Method)
            || ctx.WebSockets.IsWebSocketRequest;
        if (auth.Enabled && unsafeMethod && request.Headers.Origin.ToString() is { Length: > 0 } origin && !SameOrigin(origin, request))
            throw new ApiException(403, "cross-site request refused");
        await next(ctx);
    }

    private static bool SameOrigin(string origin, HttpRequest request)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri)) return false;
        var defaultPort = request.IsHttps ? 443 : 80;
        return string.Equals(uri.Host, request.Host.Host, StringComparison.OrdinalIgnoreCase)
            && uri.Port == (request.Host.Port ?? defaultPort);
    }
}
