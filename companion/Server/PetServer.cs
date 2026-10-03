using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging;
using PeekPets.Companion.Facts;
using PeekPets.Companion.Sensors;

namespace PeekPets.Companion.Server;

/// <summary>
/// Serves the phone web app and the /ws live link on the LAN. Protocol details live in
/// docs/PROTOCOL.md; bump <see cref="ProtocolVersion"/> on breaking changes.
/// </summary>
public sealed class PetServer : IAsyncDisposable
{
    public const int ProtocolVersion = 1;
    public const int MaxSessions = 8;
    private const int MaxMessageBytes = 8 * 1024;
    private static readonly TimeSpan AuthTimeout = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan SilenceTimeout = TimeSpan.FromSeconds(20);

    private readonly CompanionSettings _settings;
    private readonly Pairing _pairing;
    private readonly CursorSampler _sampler;
    private readonly FactHub _facts;
    private readonly Stopwatch _clock;
    private readonly List<ClientSession> _sessions = [];
    private readonly object _gate = new();
    private readonly CancellationTokenSource _shutdown = new();
    private WebApplication? _app;

    public string PhoneRoot { get; }
    public int Port => _settings.Port;
    public string Version { get; } = typeof(PetServer).Assembly.GetName().Version?.ToString(3) ?? "0.1.0";

    public event Action? SessionsChanged;
    public event Action<string>? Log;
    public event Action<string, string>? PetEvent; // (phone name, event name)

    public PetServer(CompanionSettings settings, Pairing pairing, CursorSampler sampler, FactHub facts, Stopwatch clock)
    {
        _settings = settings;
        _pairing = pairing;
        _sampler = sampler;
        _facts = facts;
        _clock = clock;
        PhoneRoot = FindPhoneRoot();

        _sampler.Moved += OnCursor;
        _sampler.Tick += OnTick;
        _sampler.ButtonDown += OnButtons;
        _sampler.LayoutChanged += layout => Broadcast(ScreensMessage(layout));
        _facts.Changed += (key, value) => Broadcast(new { t = "fact", key, value });
    }

    public IReadOnlyList<ClientSession> Sessions { get { lock (_gate) return _sessions.ToList(); } }

    public async Task StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { ContentRootPath = AppContext.BaseDirectory });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(k => k.ListenAnyIP(_settings.Port));
        var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            if (!NetworkInfo.IsLocalNetwork(ctx.Connection.RemoteIpAddress))
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
            ctx.Response.Headers["Cache-Control"] = "no-cache";
            await next();
        });
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

        app.MapGet("/api/info", () => Results.Json(new { app = "peek-pets", name = "Peek Pets Companion", version = Version, proto = ProtocolVersion }));
        app.Map("/ws", HandleSocketAsync);

        var files = new PhysicalFileProvider(PhoneRoot);
        var types = new FileExtensionContentTypeProvider();
        types.Mappings[".webmanifest"] = "application/manifest+json";
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = files, ContentTypeProvider = types });

        await app.StartAsync(_shutdown.Token);
        _app = app;
        Log?.Invoke($"Listening on port {_settings.Port}, serving {PhoneRoot}");
    }

    private async Task HandleSocketAsync(HttpContext ctx)
    {
        if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
        if (Sessions.Count >= MaxSessions) { ctx.Response.StatusCode = 503; return; }

        using var socket = await ctx.WebSockets.AcceptWebSocketAsync();
        var ip = ctx.Connection.RemoteIpAddress ?? IPAddress.None;
        var session = new ClientSession(socket, ip, ctx.Request.Headers.UserAgent.ToString(), _clock);
        lock (_gate) _sessions.Add(session);
        SessionsChanged?.Invoke();

        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ctx.RequestAborted, _shutdown.Token);
        session.Enqueue(new { t = "hello", v = ProtocolVersion, app = "peek-pets", version = Version, ts = Now() });
        var sender = session.RunSenderAsync(linked.Token);
        try
        {
            await ReceiveLoopAsync(socket, session, linked.Token);
        }
        catch (OperationCanceledException) { }
        catch (WebSocketException) { }
        finally
        {
            bool wasStreaming = session.IsStreaming;
            lock (_gate) _sessions.Remove(session);
            if (wasStreaming) _sampler.RemoveListener();
            linked.Cancel();
            try { await sender; } catch (Exception) { /* sender ends with the socket */ }
            if (session.IsAuthed) Log?.Invoke($"{session.DisplayName} disconnected");
            SessionsChanged?.Invoke();
        }
    }

    private async Task ReceiveLoopAsync(WebSocket socket, ClientSession session, CancellationToken ct)
    {
        var buffer = new byte[MaxMessageBytes];
        while (socket.State == WebSocketState.Open)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(session.IsAuthed ? SilenceTimeout : AuthTimeout);
            int count = 0;
            ValueWebSocketReceiveResult result;
            do
            {
                if (count >= buffer.Length) { await session.CloseAsync("too_big"); return; }
                result = await socket.ReceiveAsync(buffer.AsMemory(count), timeout.Token);
                count += result.Count;
            } while (!result.EndOfMessage);

            if (result.MessageType == WebSocketMessageType.Close) return;
            if (result.MessageType != WebSocketMessageType.Text) continue;
            try
            {
                using var doc = JsonDocument.Parse(Encoding.UTF8.GetString(buffer, 0, count));
                await HandleMessageAsync(session, doc.RootElement);
            }
            catch (JsonException) { session.Enqueue(new { t = "error", reason = "bad_json" }); }
        }
    }

    private async Task HandleMessageAsync(ClientSession s, JsonElement m)
    {
        string type = Str(m, "t") ?? "";
        if (!s.IsAuthed && type is not ("auth" or "ping")) { s.Enqueue(new { t = "auth_err", reason = "not_authed" }); return; }

        switch (type)
        {
            case "ping":
                s.Enqueue(new { t = "pong", id = Num(m, "id"), t0 = Num(m, "t0"), ts = Now() });
                break;
            case "auth":
                await AuthenticateAsync(s, m);
                break;
            case "sub":
                bool wasStreaming = s.IsStreaming;
                if (Num(m, "cursorHz") is double hz) s.CursorHz = (int)Math.Clamp(hz, ClientSession.MinCursorHz, ClientSession.MaxCursorHz);
                if (m.TryGetProperty("paused", out var p) && p.ValueKind is JsonValueKind.True or JsonValueKind.False) s.Paused = p.GetBoolean();
                UpdateListener(wasStreaming, s);
                if (s.IsStreaming && _sampler.Latest is { } latest && _settings.IsShared("cursor")) s.EnqueueCursor(latest);
                break;
            case "stats":
                s.PhoneRttMs = Num(m, "rtt");
                s.PhoneFps = Num(m, "fps");
                s.PhoneLatencyMs = Num(m, "lat");
                SessionsChanged?.Invoke();
                break;
            case "event":
                var name = Str(m, "name");
                if (name is { Length: > 0 and <= 32 }) PetEvent?.Invoke(s.DisplayName, name);
                break;
        }
    }

    private async Task AuthenticateAsync(ClientSession s, JsonElement m)
    {
        if (s.IsAuthed) return;
        string? code = Str(m, "code"), token = Str(m, "token");
        string? deviceName = m.TryGetProperty("device", out var d) && d.ValueKind == JsonValueKind.Object ? Str(d, "name") : null;
        _pairing.RefreshIfExpired();
        var result = token is not null ? _pairing.AuthWithToken(token, s.Ip) : _pairing.PairWithCode(code, s.Ip, deviceName ?? "iPhone");

        if (!result.Ok)
        {
            s.Enqueue(new { t = "auth_err", reason = result.Reason });
            Log?.Invoke($"Pairing refused from {s.Ip}: {result.Reason}");
            if (result.Error == AuthError.RateLimited) { await Task.Delay(200); await s.CloseAsync("rate_limited"); }
            return;
        }

        s.Device = result.Device;
        s.Enqueue(new
        {
            t = "auth_ok",
            token = result.NewToken, // only present on first pairing
            deviceId = result.Device!.Id,
            pc = Environment.MachineName,
            version = Version,
            shared = SharedMap(),
            facts = _facts.Snapshot(),
            catalog = _facts.Providers.Select(p => new { key = p.Key, label = p.Label, description = p.Description }),
        });
        s.EnqueueRaw(JsonSerializer.Serialize(ScreensMessage(_sampler.Layout)));
        UpdateListener(false, s);
        if (_sampler.Latest is { } latest && _settings.IsShared("cursor")) s.EnqueueCursor(latest);
        Log?.Invoke(result.NewToken is not null ? $"Paired new phone: {s.DisplayName}" : $"{s.DisplayName} connected");
        SessionsChanged?.Invoke();
    }

    private void UpdateListener(bool wasStreaming, ClientSession s)
    {
        if (!wasStreaming && s.IsStreaming) _sampler.AddListener();
        else if (wasStreaming && !s.IsStreaming) _sampler.RemoveListener();
    }

    private void OnCursor(CursorSample sample)
    {
        if (!_settings.IsShared("cursor")) return;
        foreach (var s in Sessions) if (s.IsStreaming) s.EnqueueCursor(sample);
    }

    private void OnTick()
    {
        lock (_gate) foreach (var s in _sessions) if (s.IsStreaming) s.OnSamplerTick();
    }

    private void OnButtons(int pressed)
    {
        if (_settings.IsShared("clicks")) Broadcast(new { t = "click", b = pressed });
    }

    /// <summary>Re-sends sharing state + facts after the user flips a toggle.</summary>
    public void SharingChanged()
    {
        _facts.Invalidate();
        Broadcast(new { t = "sharing", shared = SharedMap(), facts = _facts.Snapshot() });
    }

    /// <summary>Shows a speech bubble on every connected pet (hook for future AI / notifications).</summary>
    public void Say(string text)
    {
        var clean = new string(text.Where(c => !char.IsControl(c)).Take(80).ToArray()).Trim();
        if (clean.Length > 0) Broadcast(new { t = "say", text = clean });
    }

    public void Broadcast(object message)
    {
        var json = JsonSerializer.Serialize(message);
        foreach (var s in Sessions) if (s.IsAuthed) s.EnqueueRaw(json);
    }

    private Dictionary<string, bool> SharedMap() =>
        new[] { "cursor", "clicks" }.Concat(_facts.Providers.Select(p => p.Key)).ToDictionary(k => k, _settings.IsShared);

    private static object ScreensMessage(DisplayLayout layout) => new
    {
        t = "screens",
        list = layout.Screens.Select(s => new { x = s.X, y = s.Y, w = s.W, h = s.H, primary = s.Primary }),
        virt = new { x = layout.Virtual.X, y = layout.Virtual.Y, w = layout.Virtual.W, h = layout.Virtual.H },
    };

    private double Now() => Math.Round(_clock.Elapsed.TotalMilliseconds, 1);
    private static string? Str(JsonElement m, string key) => m.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    private static double? Num(JsonElement m, string key) => m.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetDouble() : null;

    private static string FindPhoneRoot()
    {
        // Dev checkout: prefer the live ../phone folder so edits reach Safari on refresh.
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (int i = 0; i < 6 && dir is not null; i++, dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, "phone");
            if (File.Exists(Path.Combine(candidate, "index.html"))) return candidate;
        }
        return Path.Combine(AppContext.BaseDirectory, "wwwroot");
    }

    public async ValueTask DisposeAsync()
    {
        Broadcast(new { t = "bye", reason = "companion_closed" });
        await Task.Delay(150); // let the bye flush
        foreach (var s in Sessions) await s.CloseAsync("companion_closed");
        _shutdown.Cancel();
        if (_app is not null)
        {
            using var stopCts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            try { await _app.StopAsync(stopCts.Token); } catch (Exception) { /* shutting down */ }
            await _app.DisposeAsync();
        }
        _sampler.Dispose();
        _facts.Dispose();
    }
}
