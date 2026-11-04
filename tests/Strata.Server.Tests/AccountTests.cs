using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Strata.Data;

namespace Strata.Server.Tests;

public class AccountTests
{
    private const string Password = "correct horse battery";

    private static async Task<HttpClient> SignUp(StrataFactory factory, string email, string name = "")
    {
        var http = factory.CreateClient();
        var response = await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email, password = Password, displayName = name });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return http;
    }

    private static async Task<string> NewDiagram(HttpClient http, string name = "mine") =>
        (await (await http.SendJson(HttpMethod.Post, "/api/diagrams", new { name })).Body()).GetProperty("id").GetString()!;

    private static Task<HttpResponseMessage> Share(HttpClient owner, string id, string email, string role) =>
        owner.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email, role });

    [Fact]
    public async Task Signed_out_callers_get_401_except_on_public_endpoints()
    {
        using var factory = new StrataFactory { Auth = true };
        var http = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/diagrams")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.SendJson(HttpMethod.Post, "/api/diagrams")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/export")).StatusCode);
        var error = await (await http.GetAsync("/api/diagrams")).Body();
        Assert.Equal("sign in required", error.GetProperty("error").GetString());

        Assert.Equal("ok", await http.GetStringAsync("/healthz"));
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync("/api/shared/nope")).StatusCode);
        var me = await http.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.True(me.GetProperty("authEnabled").GetBoolean());
        Assert.True(me.GetProperty("signupOpen").GetBoolean());
        Assert.Equal(JsonValueKind.Null, me.GetProperty("user").ValueKind);
    }

    [Fact]
    public async Task With_accounts_off_nothing_asks_for_sign_in()
    {
        using var factory = new StrataFactory();
        var http = factory.CreateClient();

        var me = await http.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.False(me.GetProperty("authEnabled").GetBoolean());
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/diagrams")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email = "a@b.co", password = Password })).StatusCode);
    }

    [Fact]
    public async Task Register_signs_in_and_logout_ends_the_session()
    {
        using var factory = new StrataFactory { Auth = true };
        var http = await SignUp(factory, "Ada@Example.com", "Ada");

        var me = await http.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal("ada@example.com", me.GetProperty("user").GetProperty("email").GetString());
        Assert.Equal("Ada", me.GetProperty("user").GetProperty("displayName").GetString());
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/diagrams")).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await http.SendJson(HttpMethod.Post, "/api/auth/logout")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/diagrams")).StatusCode);

        var again = factory.CreateClient();
        var login = await again.SendJson(HttpMethod.Post, "/api/auth/login", new { email = "ada@example.com", password = Password });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await again.GetAsync("/api/diagrams")).StatusCode);
    }

    [Fact]
    public async Task A_logged_out_session_cannot_be_reused_with_its_old_cookie()
    {
        using var factory = new StrataFactory { Auth = true };
        var http = factory.CreateClient();
        var registered = await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email = "a@example.com", password = Password });
        var cookie = registered.Headers.GetValues("Set-Cookie").Single().Split(';')[0];

        var copy = factory.Server.CreateClient();
        copy.DefaultRequestHeaders.Add("Cookie", cookie);
        Assert.Equal(HttpStatusCode.OK, (await copy.GetAsync("/api/diagrams")).StatusCode);

        await http.SendJson(HttpMethod.Post, "/api/auth/logout");

        Assert.Equal(HttpStatusCode.Unauthorized, (await copy.GetAsync("/api/diagrams")).StatusCode);
    }

    [Fact]
    public async Task The_session_cookie_is_http_only_and_same_site()
    {
        using var factory = new StrataFactory { Auth = true };
        var response = await factory.CreateClient().SendJson(HttpMethod.Post, "/api/auth/register", new { email = "a@example.com", password = Password });

        var cookie = response.Headers.GetValues("Set-Cookie").Single().ToLowerInvariant();
        Assert.Contains("strata_session=", cookie);
        Assert.Contains("httponly", cookie);
        Assert.Contains("samesite=lax", cookie);
        Assert.Contains("path=/", cookie);
        Assert.Contains("max-age=", cookie);
    }

    [Fact]
    public async Task Passwords_and_session_tokens_are_not_stored_in_the_clear()
    {
        using var factory = new StrataFactory { Auth = true };
        var http = factory.CreateClient();
        var response = await http.SendJson(HttpMethod.Post, "/api/auth/register", new { email = "a@example.com", password = Password });
        var token = response.Headers.GetValues("Set-Cookie").Single().Split(';')[0].Split('=')[1];

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
        Assert.DoesNotContain(Password, db.Users.Single().PasswordHash);
        Assert.NotEmpty(db.Users.Single().PasswordHash);
        Assert.DoesNotContain(token, db.Sessions.Single().TokenHash);
    }

    [Theory]
    [InlineData("not-an-email", "correct horse battery")]
    [InlineData("a@example.com", "short")]
    [InlineData("", "correct horse battery")]
    public async Task Registration_rejects_bad_input(string email, string password)
    {
        using var factory = new StrataFactory { Auth = true };
        var response = await factory.CreateClient().SendJson(HttpMethod.Post, "/api/auth/register", new { email, password });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task The_same_email_cannot_register_twice_whatever_its_case()
    {
        using var factory = new StrataFactory { Auth = true };
        await SignUp(factory, "a@example.com");
        var again = await factory.CreateClient().SendJson(HttpMethod.Post, "/api/auth/register", new { email = "A@EXAMPLE.COM", password = Password });
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Wrong_password_and_unknown_email_look_the_same()
    {
        using var factory = new StrataFactory { Auth = true };
        await SignUp(factory, "a@example.com");
        var http = factory.CreateClient();

        var wrong = await http.SendJson(HttpMethod.Post, "/api/auth/login", new { email = "a@example.com", password = "not the password" });
        var unknown = await http.SendJson(HttpMethod.Post, "/api/auth/login", new { email = "nobody@example.com", password = Password });

        Assert.Equal(HttpStatusCode.Unauthorized, wrong.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);
        Assert.Equal(await wrong.Content.ReadAsStringAsync(), await unknown.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Repeated_failures_lock_the_account_for_a_while_even_with_the_right_password()
    {
        using var factory = new StrataFactory { Auth = true };
        await SignUp(factory, "a@example.com");
        var http = factory.CreateClient();

        for (var i = 0; i < 10; i++)
            Assert.Equal(HttpStatusCode.Unauthorized, (await http.SendJson(HttpMethod.Post, "/api/auth/login", new { email = "a@example.com", password = "wrong " + i })).StatusCode);

        var blocked = await http.SendJson(HttpMethod.Post, "/api/auth/login", new { email = "a@example.com", password = Password });
        Assert.Equal(HttpStatusCode.TooManyRequests, blocked.StatusCode);
    }

    [Fact]
    public async Task Further_sign_ups_can_be_closed_but_the_first_account_is_always_allowed()
    {
        using var factory = new StrataFactory { Auth = true, AllowSignup = false };
        var anonymous = factory.CreateClient();
        Assert.True((await anonymous.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("signupOpen").GetBoolean());

        await SignUp(factory, "first@example.com");

        Assert.False((await anonymous.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("signupOpen").GetBoolean());
        var second = await factory.CreateClient().SendJson(HttpMethod.Post, "/api/auth/register", new { email = "second@example.com", password = Password });
        Assert.Equal(HttpStatusCode.Forbidden, second.StatusCode);
    }

    [Fact]
    public async Task Diagrams_belong_to_their_owner_and_stay_invisible_to_everyone_else()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var bob = await SignUp(factory, "bob@example.com");
        var id = await NewDiagram(ada);

        Assert.Equal(1, (await ada.GetFromJsonAsync<JsonElement>("/api/diagrams")).GetArrayLength());
        Assert.Equal(0, (await bob.GetFromJsonAsync<JsonElement>("/api/diagrams")).GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "x", data = Samples.Empty })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.DeleteAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/rotate-view-token")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/diagrams/{id}/shares")).StatusCode);
    }

    [Fact]
    public async Task The_public_view_link_works_without_an_account_and_stops_after_rotation()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var created = await (await ada.SendJson(HttpMethod.Post, "/api/diagrams", new { name = "public" })).Body();
        var token = created.GetProperty("viewToken").GetString();
        var id = created.GetProperty("id").GetString();

        var stranger = factory.CreateClient();
        Assert.Equal("public", (await stranger.GetFromJsonAsync<JsonElement>($"/api/shared/{token}")).GetProperty("name").GetString());

        await ada.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/rotate-view-token");
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/shared/{token}")).StatusCode);
    }

    [Fact]
    public async Task A_viewer_can_read_but_not_change_delete_or_reshare()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com", "Ada");
        var bob = await SignUp(factory, "bob@example.com");
        var id = await NewDiagram(ada, "plan");
        Assert.Equal(HttpStatusCode.OK, (await Share(ada, id, "bob@example.com", "viewer")).StatusCode);

        var list = (await bob.GetFromJsonAsync<JsonElement>("/api/diagrams"))[0];
        Assert.Equal("viewer", list.GetProperty("role").GetString());
        Assert.Equal("Ada", list.GetProperty("ownerName").GetString());

        var opened = await bob.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}");
        Assert.Equal("viewer", opened.GetProperty("role").GetString());
        Assert.Equal(JsonValueKind.Null, opened.GetProperty("viewToken").ValueKind);

        Assert.Equal(HttpStatusCode.Forbidden, (await bob.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "x", data = Samples.Empty })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.SendJson(HttpMethod.Post, $"/api/diagrams/{id}/rotate-view-token")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bob.GetAsync($"/api/diagrams/{id}/shares")).StatusCode);
        Assert.Equal("plan", (await ada.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("name").GetString());
    }

    [Fact]
    public async Task An_editor_can_save_but_still_cannot_delete_or_reshare()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var bob = await SignUp(factory, "bob@example.com");
        var id = await NewDiagram(ada);
        await Share(ada, id, "bob@example.com", "editor");

        var saved = await bob.SendJson(HttpMethod.Put, $"/api/diagrams/{id}", new { name = "edited by bob", data = Samples.WithNodes(Samples.Node()) });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal("editor", (await saved.Body()).GetProperty("role").GetString());
        Assert.Equal("edited by bob", (await ada.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}")).GetProperty("name").GetString());

        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Share(bob, id, "ada@example.com", "viewer")).StatusCode);
    }

    [Fact]
    public async Task Sharing_can_be_changed_listed_and_withdrawn()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var bob = await SignUp(factory, "bob@example.com", "Bob");
        var id = await NewDiagram(ada);

        await Share(ada, id, "bob@example.com", "viewer");
        var upgraded = await (await Share(ada, id, "BOB@example.com", "editor")).Body();
        Assert.Equal("editor", upgraded.GetProperty("role").GetString());

        var shares = await ada.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/shares");
        Assert.Equal(1, shares.GetArrayLength());
        Assert.Equal("Bob", shares[0].GetProperty("displayName").GetString());
        var bobId = shares[0].GetProperty("userId").GetString();

        Assert.Equal(HttpStatusCode.NoContent, (await ada.DeleteAsync($"/api/diagrams/{id}/shares/{bobId}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(0, (await bob.GetFromJsonAsync<JsonElement>("/api/diagrams")).GetArrayLength());
    }

    [Fact]
    public async Task Someone_a_diagram_is_shared_with_can_remove_themselves_but_not_others()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var bob = await SignUp(factory, "bob@example.com");
        var cy = await SignUp(factory, "cy@example.com");
        var id = await NewDiagram(ada);
        await Share(ada, id, "bob@example.com", "viewer");
        await Share(ada, id, "cy@example.com", "viewer");
        var shares = await ada.GetFromJsonAsync<JsonElement>($"/api/diagrams/{id}/shares");
        var ids = shares.EnumerateArray().ToDictionary(s => s.GetProperty("email").GetString()!, s => s.GetProperty("userId").GetString()!);

        Assert.Equal(HttpStatusCode.Forbidden, (await bob.DeleteAsync($"/api/diagrams/{id}/shares/{ids["cy@example.com"]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await bob.DeleteAsync($"/api/diagrams/{id}/shares/{ids["bob@example.com"]}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bob.GetAsync($"/api/diagrams/{id}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await cy.GetAsync($"/api/diagrams/{id}")).StatusCode);
    }

    [Fact]
    public async Task Sharing_needs_an_existing_account_and_not_the_owner_themselves()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var id = await NewDiagram(ada);

        Assert.Equal(HttpStatusCode.NotFound, (await Share(ada, id, "nobody@example.com", "viewer")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Share(ada, id, "ada@example.com", "viewer")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await ada.SendJson(HttpMethod.Put, $"/api/diagrams/{id}/shares", new { email = "ada@example.com" })).StatusCode);
    }

    [Fact]
    public async Task Deleting_a_diagram_removes_its_shares()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var bob = await SignUp(factory, "bob@example.com");
        var id = await NewDiagram(ada);
        await Share(ada, id, "bob@example.com", "viewer");

        Assert.Equal(HttpStatusCode.NoContent, (await ada.DeleteAsync($"/api/diagrams/{id}")).StatusCode);

        Assert.Equal(0, (await bob.GetFromJsonAsync<JsonElement>("/api/diagrams")).GetArrayLength());
        using var scope = factory.Services.CreateScope();
        Assert.Empty(scope.ServiceProvider.GetRequiredService<StrataDbContext>().Shares);
    }

    private static async Task PlantUnownedDiagram(StrataFactory factory)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
        db.Diagrams.Add(new Diagram { Id = "from-before", ViewToken = "ZZZZZZZZZZZZZZZZZZZZZZ", Name = "From before accounts", Data = """{"nodes":[],"connectors":[],"zones":[]}""", CreatedAt = 1, UpdatedAt = 1 });
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Diagrams_from_before_accounts_go_to_the_first_account_only()
    {
        using var factory = new StrataFactory { Auth = true };
        factory.CreateClient();
        await PlantUnownedDiagram(factory);

        var first = await SignUp(factory, "first@example.com");
        var second = await SignUp(factory, "second@example.com");

        Assert.Equal("From before accounts", (await first.GetFromJsonAsync<JsonElement>("/api/diagrams/from-before")).GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await second.GetAsync("/api/diagrams/from-before")).StatusCode);
    }

    [Fact]
    public async Task Unowned_diagrams_are_invisible_to_everyone_until_claimed()
    {
        using var factory = new StrataFactory { Auth = true, AdminEmail = "boss@example.com" };
        factory.CreateClient();
        await PlantUnownedDiagram(factory);

        var stranger = await SignUp(factory, "stranger@example.com");
        Assert.Equal(0, (await stranger.GetFromJsonAsync<JsonElement>("/api/diagrams")).GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/diagrams/from-before")).StatusCode);

        var boss = await SignUp(factory, "boss@example.com");
        Assert.Equal(1, (await boss.GetFromJsonAsync<JsonElement>("/api/diagrams")).GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync("/api/diagrams/from-before")).StatusCode);
    }

    [Fact]
    public async Task Export_and_import_only_touch_the_callers_own_diagrams()
    {
        using var factory = new StrataFactory { Auth = true };
        var ada = await SignUp(factory, "ada@example.com");
        var bob = await SignUp(factory, "bob@example.com");
        var adaDiagram = await NewDiagram(ada, "ada's");
        await NewDiagram(bob, "bob's");

        var exported = await (await bob.GetAsync("/api/export")).Body();
        Assert.Equal(["bob's"], exported.GetProperty("diagrams").EnumerateArray().Select(d => d.GetProperty("name").GetString()).ToArray());

        var hijack = new { format = "strata-export", version = 1, diagrams = new[] { new { id = adaDiagram, name = "taken over", data = Samples.Empty } } };
        var result = await (await bob.SendJson(HttpMethod.Post, "/api/import?overwrite=true", hijack)).Body();
        Assert.Equal(0, result.GetProperty("replaced").GetInt32());
        Assert.Equal("id belongs to another account", result.GetProperty("rejected")[0].GetProperty("error").GetString());
        Assert.Equal("ada's", (await ada.GetFromJsonAsync<JsonElement>($"/api/diagrams/{adaDiagram}")).GetProperty("name").GetString());

        var fresh = new { format = "strata-export", version = 1, diagrams = new[] { new { id = "brought-along", name = "imported", data = Samples.Empty } } };
        await bob.SendJson(HttpMethod.Post, "/api/import", fresh);
        Assert.Equal(HttpStatusCode.OK, (await bob.GetAsync("/api/diagrams/brought-along")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await ada.GetAsync("/api/diagrams/brought-along")).StatusCode);
    }

    [Fact]
    public async Task Requests_from_another_site_are_refused_but_same_site_and_tool_requests_work()
    {
        using var factory = new StrataFactory { Auth = true };
        var http = await SignUp(factory, "ada@example.com");

        Request("https://evil.example");
        Assert.Equal(HttpStatusCode.Forbidden, (await http.SendJson(HttpMethod.Post, "/api/diagrams")).StatusCode);
        Request("null");
        Assert.Equal(HttpStatusCode.Forbidden, (await http.SendJson(HttpMethod.Post, "/api/diagrams")).StatusCode);
        Request("http://localhost");
        Assert.Equal(HttpStatusCode.Created, (await http.SendJson(HttpMethod.Post, "/api/diagrams")).StatusCode);
        Request(null);
        Assert.Equal(HttpStatusCode.Created, (await http.SendJson(HttpMethod.Post, "/api/diagrams")).StatusCode);
        Request("https://evil.example");
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/diagrams")).StatusCode);

        void Request(string? origin)
        {
            http.DefaultRequestHeaders.Remove("Origin");
            if (origin is not null) http.DefaultRequestHeaders.Add("Origin", origin);
        }
    }

    [Fact]
    public async Task Expired_sessions_no_longer_sign_anyone_in()
    {
        using var factory = new StrataFactory { Auth = true };
        var http = await SignUp(factory, "ada@example.com");
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<StrataDbContext>();
            foreach (var s in db.Sessions) s.ExpiresAt = 1;
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/diagrams")).StatusCode);
    }
}
