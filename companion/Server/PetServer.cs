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
using PeekPets.Companion.Powers;
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
    private const int MaxMessageBytes = 24 * 1024; // 4000 non-ASCII characters of handoff text fit
    private const int MessagesPerMinute = 900;     // ~15/s: far above pings + stats + taps
    private const int MaxDroppedMessages = 200;
    private static readonly TimeSpan UploadDeadline = TimeSpan.FromSeconds(30);
    private const int MaxCommandsInFlight = 8;
    private const int MaxUnauthedPerIp = 2;
    private static readonly TimeSpan AuthTimeout = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan SilenceTimeout = TimeSpan.FromSeconds(20);

    private readonly CompanionSettings _settings;
    private readonly Pairing _pairing;
    private readonly CursorSampler _sampler;
    private readonly FactHub _facts;
    private readonly Stopwatch _clock;
    private readonly LocalCertificates? _certs;
    private readonly List<ClientSession> _sessions = [];
    private readonly object _gate = new();
    private readonly CancellationTokenSource _shutdown = new();
    private readonly RateLimiter _messageLimits = new(() => DateTime.UtcNow);
    private WebApplication? _app;
    private MdnsAdvertiser? _mdns;
    public string? MdnsStatus { get; private set; }

    public string PhoneRoot { get; }
    public int Port => _settings.Port;
    /// <summary>HTTPS port for the installable app mode (always Port + 1).</summary>
    public int SecurePort => _settings.Port + 1;
    public bool SecureEnabled { get; private set; }
    public string CaFingerprintShort => _certs?.AuthorityFingerprint[..23] ?? "";
    /// <summary>Bind to 127.0.0.1 only (testing; no phones, no firewall prompt).</summary>
    public bool LoopbackOnly { get; init; }
    /// <summary>The helpful-powers host (null = powers disabled).</summary>
    public PowerHost? Powers { get; init; }
    /// <summary>Expose /api/test/* (only honoured together with <see cref="LoopbackOnly"/>; used by the e2e harness).</summary>
    public bool TestHooks { get; init; }
    public string Version { get; } = typeof(PetServer).Assembly.GetName().Version?.ToString(3) ?? "0.1.0";

    public event Action? SessionsChanged;
    public event Action<string>? Log;
    public event Action<string, string>? PetEvent; // (phone name, event name)

    public PetServer(CompanionSettings settings, Pairing pairing, CursorSampler sampler, FactHub facts, Stopwatch clock, LocalCertificates? certs = null)
    {
        _certs = certs;
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

    private void AttachPowers()
    {
        if (Powers is null) return;
        Powers.Broadcast = Broadcast;
        Powers.DeviceExists = id => _pairing.Devices.Any(d => d.Id == id);
        Powers.Start();
    }

    public IReadOnlyList<ClientSession> Sessions { get { lock (_gate) return _sessions.ToList(); } }

    public async Task StartAsync()
    {
        var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { ContentRootPath = AppContext.BaseDirectory });
        builder.Logging.ClearProviders();
        builder.WebHost.ConfigureKestrel(k =>
        {
            if (LoopbackOnly) k.ListenLocalhost(_settings.Port);
            else k.ListenAnyIP(_settings.Port);
            if (_certs is null || LoopbackOnly) return;
            try
            {
                _ = _certs.ServerCertificate(CurrentLan(), Environment.MachineName); // fail early, not mid-handshake
                k.ListenAnyIP(SecurePort, o => o.UseHttps(h =>
                    h.ServerCertificateSelector = (_, _) => _certs.ServerCertificate(CurrentLan(), Environment.MachineName)));
                SecureEnabled = true;
            }
            catch (Exception ex)
            {
                Log?.Invoke($"Secure (app) mode unavailable: {ex.Message}");
            }
        });
        var app = builder.Build();

        app.Use(async (ctx, next) =>
        {
            if (!NetworkInfo.IsLocalNetwork(ctx.Connection.RemoteIpAddress) || !NetworkInfo.IsAllowedHost(ctx.Request.Host.Host))
            {
                // Unknown Host names are refused too: a DNS-rebinding page can fake the origin, not the Host check.
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            // The native iPhone app's pages come from capacitor://localhost: let exactly those
            // origins call the API (never a wildcard, never a reflected arbitrary origin).
            var origin = ctx.Request.Headers.Origin.ToString();
            if (origin is "capacitor://localhost" or "ionic://localhost")
            {
                ctx.Response.Headers["Access-Control-Allow-Origin"] = origin;
                ctx.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
                ctx.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST";
                ctx.Response.Headers["Vary"] = "Origin";
                if (HttpMethods.IsOptions(ctx.Request.Method)) { ctx.Response.StatusCode = StatusCodes.Status204NoContent; return; }
            }
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
            ctx.Response.Headers["Cache-Control"] = "no-cache";
            await next();
        });
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });

        app.MapGet("/api/info", () => Results.Json(new
        {
            app = "peek-pets", name = "Peek Pets Companion", version = Version, proto = ProtocolVersion,
            securePort = SecureEnabled ? SecurePort : (int?)null,
            caFingerprint = SecureEnabled ? _certs?.AuthorityFingerprint : null,
        }));
        app.MapGet("/api/assets", () => Results.Json(AssetManifest()));
        if (_certs is not null)
        {
            app.MapGet("/ca.crt", () => Results.File(_certs.AuthorityDer, "application/x-x509-ca-cert", "PeekPets-Local-CA.crt"));
        }
        app.Map("/ws", HandleSocketAsync);
        if (Powers is not null) app.MapPost("/api/inbox", HandleInboxUploadAsync);
        if (TestHooks && LoopbackOnly && Powers is not null) TestRoutes.Map(app, Powers);

        var files = new PhysicalFileProvider(PhoneRoot);
        var types = new FileExtensionContentTypeProvider();
        types.Mappings[".webmanifest"] = "application/manifest+json";
        app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
        app.UseStaticFiles(new StaticFileOptions { FileProvider = files, ContentTypeProvider = types });

        await app.StartAsync(_shutdown.Token);
        _app = app;
        AttachPowers();
        Log?.Invoke($"Listening on port {_settings.Port}, serving {PhoneRoot}");
        if (!LoopbackOnly) Advertise();
    }

    /// <summary>Bonjour: lets the iPhone app find this PC without typing an address.</summary>
    private void Advertise()
    {
        var lan = CurrentLan();
        _mdns = new MdnsAdvertiser();
        var txt = MdnsAdvertiser.TxtRecord(Environment.MachineName, lan, Port, SecureEnabled ? SecurePort : 0, ProtocolVersion, Version);
        MdnsStatus = _mdns.Start(Environment.MachineName, lan, Port, txt) ? "advertising _peekpets._tcp" : $"not advertised ({_mdns.Error})";
        Log?.Invoke($"Bonjour: {MdnsStatus}");
    }

    private async Task HandleSocketAsync(HttpContext ctx)
    {
        if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
        // Only our own page may open the socket: blocks other websites (and DNS rebinding)
        // from poking the pairing endpoint through a browser on the LAN.
        if (!SameOrigin(ctx)) { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
        var remote = ctx.Connection.RemoteIpAddress ?? IPAddress.None;
        if (Sessions.Count >= MaxSessions) { ctx.Response.StatusCode = 503; return; }
        if (Sessions.Count(s => !s.IsAuthed && s.Ip.Equals(remote)) >= MaxUnauthedPerIp) { ctx.Response.StatusCode = 429; return; }

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
        // Hard deadline: an unauthenticated socket gets AuthTimeout in total, however chatty.
        var authDeadline = _clock.Elapsed + AuthTimeout;
        while (socket.State == WebSocketState.Open)
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var left = session.IsAuthed ? SilenceTimeout : authDeadline - _clock.Elapsed;
            if (left <= TimeSpan.Zero) { await session.CloseAsync("auth_timeout"); return; }
            timeout.CancelAfter(left);
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
        if (s.IsAuthed && !AllowMessage(s, type)) return;

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
            case "power_set":
                if (Powers is not null && Str(m, "key") is { Length: <= 32 } key && m.TryGetProperty("on", out var on) && on.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    Powers.SetPhoneOn(key, on.GetBoolean(), s.DisplayName);
                break;
            case "power_ack":
                Powers?.Ack(Str(m, "key"), Str(m, "action"), Str(m, "kind"));
                break;
            case "cmd":
                StartCommand(s, m);
                break;
        }
    }

    /// <summary>
    /// Per-connection message budget (and tighter ones for power switches/acks), so a paired
    /// phone can't flood the companion. A connection that keeps exceeding it is closed.
    /// </summary>
    private bool AllowMessage(ClientSession s, string type)
    {
        bool ok = type == "ping" || _messageLimits.TryTake($"{s.Id}|all", MessagesPerMinute);
        if (ok && type == "power_set") ok = _messageLimits.TryTake($"{s.Device!.Id}|power_set", 30);
        if (ok && type == "power_ack") ok = _messageLimits.TryTake($"{s.Device!.Id}|power_ack", 60);
        if (ok) return true;
        if (Interlocked.Increment(ref s.DroppedMessages) > MaxDroppedMessages) _ = s.CloseAsync("flood");
        return false;
    }

    /// <summary>Forget a phone everywhere at once: every open connection loses its identity and is closed.</summary>
    public void RevokeDevice(string deviceId)
    {
        foreach (var s in Sessions.Where(x => x.Device?.Id == deviceId))
        {
            s.Device = null;
            _ = s.CloseAsync("forgotten");
        }
        Powers?.ForgetDevice(deviceId);
        SessionsChanged?.Invoke();
    }

    /// <summary>
    /// Runs a phone → PC command in the background: it may wait up to a minute for approval
    /// on the PC, and the receive loop must keep answering pings meanwhile.
    /// </summary>
    private void StartCommand(ClientSession s, JsonElement m)
    {
        if (Powers is null || s.Device is not { } device || !_pairing.Devices.Any(d => d.Id == device.Id)) return;
        if (Num(m, "id") is not double idNum || idNum < 0 || idNum > int.MaxValue) return;
        int id = (int)idNum;
        if (Interlocked.Increment(ref s.CommandsInFlight) > MaxCommandsInFlight)
        {
            Interlocked.Decrement(ref s.CommandsInFlight);
            s.Enqueue(new { t = "cmd_result", id, ok = false, reason = "busy" });
            return;
        }
        var power = Str(m, "power");
        var command = Str(m, "name");
        var args = m.TryGetProperty("args", out var a) && a.ValueKind == JsonValueKind.Object ? a.Clone() : default;
        var caller = new CommandCaller(device.Id, device.Name, s.Id);
        _ = Task.Run(async () =>
        {
            try
            {
                var result = await Powers.RunCommandAsync(caller, power, command, args, onPending: () => s.Enqueue(new { t = "cmd_pending", id }));
                s.Enqueue(new { t = "cmd_result", id, ok = result.Ok, reason = result.Reason, data = result.Data });
            }
            catch (Exception ex)
            {
                Log?.Invoke($"Command {power}.{command} crashed: {ex.Message}");
                s.Enqueue(new { t = "cmd_result", id, ok = false, reason = "error" });
            }
            finally { Interlocked.Decrement(ref s.CommandsInFlight); }
        });
    }

    /// <summary>POST /api/inbox: a photo from the phone (Bearer device token, same checks as any command).</summary>
    private async Task HandleInboxUploadAsync(HttpContext ctx)
    {
        if (!SameOrigin(ctx)) { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return; }
        var auth = ctx.Request.Headers.Authorization.ToString();
        var token = auth.StartsWith("Bearer ", StringComparison.Ordinal) ? auth[7..].Trim() : null;
        var ip = ctx.Connection.RemoteIpAddress ?? IPAddress.None;
        var who = _pairing.AuthWithToken(token, ip);
        if (!who.Ok || who.Device is null) { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return; }
        if (ctx.Request.ContentLength > InboxStore.MaxImageBytes) { ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge; return; }
        // Read the whole body first, with a deadline, so a slow sender never holds the power's lock.
        byte[]? body;
        using (var deadline = CancellationTokenSource.CreateLinkedTokenSource(ctx.RequestAborted))
        {
            deadline.CancelAfter(UploadDeadline);
            try { body = await InboxStore.ReadLimitedAsync(ctx.Request.Body, InboxStore.MaxImageBytes, deadline.Token); }
            catch (OperationCanceledException) { ctx.Response.StatusCode = StatusCodes.Status408RequestTimeout; return; }
        }
        if (body is null) { ctx.Response.StatusCode = StatusCodes.Status413PayloadTooLarge; return; }
        var caller = new CommandCaller(who.Device.Id, who.Device.Name, "upload:" + ip);
        var result = await Powers!.RunCommandAsync(caller, "handoff", "send_photo", default,
            invoke: p => ((HandoffPower)p).ReceivePhotoAsync(body, caller));
        ctx.Response.StatusCode = result.Ok ? 200 : result.Reason == "not_an_image" ? 415 : result.Reason is "inbox_full" or "disk_full" ? 507 : 403;
        await ctx.Response.WriteAsJsonAsync(new { ok = result.Ok, reason = result.Reason, data = result.Data });
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
        if (Powers is not null) s.Enqueue(Powers.ListMessage());
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

    private List<IPAddress> _lanCache = [];
    private TimeSpan? _lanCachedAt; // null = never fetched (TimeSpan.MinValue would overflow on subtraction)

    /// <summary>LAN addresses for the TLS certificate, refreshed at most every 30 s (called per handshake).</summary>
    private List<IPAddress> CurrentLan()
    {
        lock (_gate)
        {
            if (_lanCachedAt is not { } at || _clock.Elapsed - at > TimeSpan.FromSeconds(30))
            {
                _lanCache = NetworkInfo.LanAddresses().Select(a => a.Address).ToList();
                _lanCachedAt = _clock.Elapsed;
            }
            return _lanCache;
        }
    }

    internal static bool SameOrigin(HttpContext ctx)
    {
        var origin = ctx.Request.Headers.Origin.ToString();
        if (string.IsNullOrEmpty(origin)) return true; // non-browser clients
        // The native iPhone app (Capacitor) loads its pages from this origin. Web pages can't claim it.
        if (origin is "capacitor://localhost" or "ionic://localhost") return true;
        return Uri.TryCreate(origin, UriKind.Absolute, out var uri)
            && string.Equals(uri.Authority, ctx.Request.Host.Value, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Every phone file + a version hash. The phone's service worker precaches these so
    /// the installed app opens even when the PC is off, and re-caches when the hash moves.
    /// </summary>
    private object AssetManifest()
    {
        var root = new DirectoryInfo(PhoneRoot);
        var files = root.EnumerateFiles("*", SearchOption.AllDirectories)
            .Where(f => !f.Name.StartsWith('.'))
            .OrderBy(f => f.FullName, StringComparer.Ordinal)
            .ToList();
        var paths = files.Select(f => "/" + Path.GetRelativePath(root.FullName, f.FullName).Replace(Path.DirectorySeparatorChar, '/')).ToList();
        var stamp = string.Join("|", files.Select(f => $"{f.FullName}:{f.Length}:{f.LastWriteTimeUtc.Ticks}"));
        var version = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(stamp)))[..16];
        return new { version, files = paths.Prepend("/").ToList() };
    }

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
        await Task.Delay(150).ConfigureAwait(false); // let the bye flush
        foreach (var s in Sessions) await s.CloseAsync("companion_closed").ConfigureAwait(false);
        _shutdown.Cancel();
        if (_app is not null)
        {
            using var stopCts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
            try { await _app.StopAsync(stopCts.Token); } catch (Exception) { /* shutting down */ }
            await _app.DisposeAsync();
        }
        _sampler.Dispose();
        _facts.Dispose();
        Powers?.Dispose();
        _mdns?.Dispose();
    }
}
