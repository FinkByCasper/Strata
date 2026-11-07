using System.Net;

namespace Strata.Server.Tests;

public class WebAppTests : IDisposable
{
    private readonly string dist = Directory.CreateTempSubdirectory("strata-dist-").FullName;

    public WebAppTests()
    {
        Directory.CreateDirectory(Path.Combine(dist, "assets"));
        File.WriteAllText(Path.Combine(dist, "index.html"), "<!doctype html><title>Strata</title><div id=root></div>");
        File.WriteAllText(Path.Combine(dist, "assets", "app.js"), "console.log(1)");
        File.WriteAllText(Path.Combine(dist, "embed.js"), "/* loader */");
    }

    public void Dispose() => Directory.Delete(dist, true);

    [Theory]
    [InlineData("/")]
    [InlineData("/d/some-id")]
    [InlineData("/v/some-token")]
    public async Task Pages_are_served_by_index_html_and_cannot_be_framed_by_other_sites(string path)
    {
        using var factory = new StrataFactory { Dist = dist };
        var response = await factory.CreateClient().GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<div id=root>", await response.Content.ReadAsStringAsync());
        Assert.Equal("SAMEORIGIN", response.Headers.GetValues("X-Frame-Options").Single());
    }

    [Fact]
    public async Task Embed_pages_can_be_framed()
    {
        using var factory = new StrataFactory { Dist = dist };
        var response = await factory.CreateClient().GetAsync("/embed/some-token");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(response.Headers.Contains("X-Frame-Options"));
    }

    [Fact]
    public async Task The_embed_loader_script_is_a_plain_file_that_other_sites_can_load_and_is_not_the_app_page()
    {
        using var factory = new StrataFactory { Dist = dist };
        var response = await factory.CreateClient().GetAsync("/embed.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("/* loader */", await response.Content.ReadAsStringAsync());
        Assert.Contains("javascript", response.Content.Headers.ContentType!.MediaType);
        Assert.Equal("public, max-age=0", response.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task Embed_pages_with_options_in_the_address_are_still_the_app_page_and_can_be_framed()
    {
        using var factory = new StrataFactory { Dist = dist };
        var response = await factory.CreateClient().GetAsync("/embed/some-token?theme=dark&bg=transparent&highlight=NAS");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<div id=root>", await response.Content.ReadAsStringAsync());
        Assert.False(response.Headers.Contains("X-Frame-Options"));
    }

    [Fact]
    public async Task Built_assets_are_served_as_files_and_revalidated()
    {
        using var factory = new StrataFactory { Dist = dist };
        var response = await factory.CreateClient().GetAsync("/assets/app.js");

        Assert.Equal("console.log(1)", await response.Content.ReadAsStringAsync());
        Assert.Equal("public, max-age=0", response.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task A_missing_asset_falls_back_to_the_app_but_an_unknown_api_path_does_not()
    {
        using var factory = new StrataFactory { Dist = dist };
        var http = factory.CreateClient();

        Assert.Contains("<div id=root>", await http.GetStringAsync("/assets/missing.js"));
        var api = await http.GetAsync("/api/nothing-here");
        Assert.Equal(HttpStatusCode.NotFound, api.StatusCode);
        Assert.Equal("application/json", api.Content.Headers.ContentType!.MediaType);
    }
}
