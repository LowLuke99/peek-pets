using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using PeekPets.Companion.Server;

namespace PeekPets.Companion.Powers;

/// <summary>Every power, in the order the phone's Powers screen lists them. Add new experiments here.</summary>
public static class PowerCatalog
{
    public static List<IPower> Create(CompanionSettings settings, IHealthProbe? probe = null, InboxStore? inbox = null) =>
    [
        new BreakBuddy(),
        new FocusPower(),
        new MediaPower(),
        new WatchPower(),
        new HealthPower(probe),
        new HandoffPower(inbox),
        new QuickPower(settings),
        new TimersPower(),
        new AwayPower(),
    ];
}

/// <summary>
/// /api/test/* for the end-to-end harness. Only mapped when the companion runs with
/// --loopback --test-hooks (127.0.0.1 only, never reachable from the network).
/// </summary>
internal static class TestRoutes
{
    public static void Map(WebApplication app, PowerHost host)
    {
        app.MapGet("/api/test/actions", () => Results.Json((host.Actions as DryRunActions)?.Calls ?? []));
        app.MapGet("/api/test/audit", () => Results.Json(host.Audit.Entries.Select(e => new { e.Power, e.Command, e.Outcome })));
        app.MapPost("/api/test/emit", async (HttpContext ctx) =>
        {
            string key = ctx.Request.Query["key"].ToString(), ev = ctx.Request.Query["ev"].ToString();
            var data = await JsonSerializer.DeserializeAsync<JsonElement>(ctx.Request.Body);
            return host.TestEmit(key, ev, data) ? Results.Ok() : Results.NotFound();
        });
        app.MapPost("/api/test/idle", (HttpContext ctx) =>
        {
            if (host.Idle is not OverridableIdle idle) return Results.NotFound();
            idle.Override = double.TryParse(ctx.Request.Query["sec"], out var sec) ? TimeSpan.FromSeconds(sec) : null;
            return Results.Ok();
        });
    }
}
