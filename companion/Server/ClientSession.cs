using System.Collections.Concurrent;
using System.Diagnostics;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using PeekPets.Companion.Sensors;
using static System.FormattableString;

namespace PeekPets.Companion.Server;

/// <summary>
/// One connected phone. Control messages (pongs, facts, events) go through a FIFO queue;
/// cursor updates go through a single "latest value" slot, so a slow link drops stale
/// positions instead of queueing them up and lagging behind the real cursor.
/// </summary>
public sealed class ClientSession
{
    public const int DefaultCursorHz = 60;
    public const int MinCursorHz = 5;
    public const int MaxCursorHz = 120;

    private readonly WebSocket _socket;
    private readonly Stopwatch _clock;
    private readonly ConcurrentQueue<string> _control = new();
    private readonly SemaphoreSlim _signal = new(0);
    private int _signaled;
    private CursorSample? _pendingCursor;
    private double _lastCursorSendMs = double.NegativeInfinity;

    public string Id { get; } = Guid.NewGuid().ToString("N")[..8];
    public IPAddress Ip { get; }
    public string UserAgent { get; }
    public DateTime ConnectedAt { get; } = DateTime.Now;
    public PairedDevice? Device { get; set; }
    public bool IsAuthed => Device is not null;
    public bool Paused { get; set; }
    public int CursorHz { get; set; } = DefaultCursorHz;
    public bool IsStreaming => IsAuthed && !Paused;

    // Stats reported by the phone, shown in the companion window.
    public double? PhoneRttMs { get; set; }
    public double? PhoneFps { get; set; }
    public double? PhoneLatencyMs { get; set; }
    public long CursorMessagesSent { get; private set; }
    public long CursorSamplesDropped { get; private set; }

    public ClientSession(WebSocket socket, IPAddress ip, string userAgent, Stopwatch clock)
    {
        _socket = socket;
        Ip = ip;
        UserAgent = userAgent;
        _clock = clock;
    }

    public string DisplayName => Device?.Name ?? DescribeAgent(UserAgent);

    public void Enqueue(object message) => EnqueueRaw(JsonSerializer.Serialize(message));

    public void EnqueueRaw(string json)
    {
        _control.Enqueue(json);
        Signal();
    }

    public void EnqueueCursor(CursorSample sample)
    {
        var previous = Interlocked.Exchange(ref _pendingCursor, sample);
        if (previous is not null) CursorSamplesDropped++;
        Signal();
    }

    private void Signal()
    {
        if (Interlocked.Exchange(ref _signaled, 1) == 0) _signal.Release();
    }

    public async Task RunSenderAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested && _socket.State == WebSocketState.Open)
        {
            await _signal.WaitAsync(ct);
            Interlocked.Exchange(ref _signaled, 0);

            while (_control.TryDequeue(out var json)) await SendAsync(json, ct);

            // Too soon for the rate limit? Leave it pending: the sampler's 125 Hz tick
            // (OnSamplerTick) re-signals us, so the final resting position always lands
            // without relying on coarse 15 ms Task.Delay timers.
            if (Volatile.Read(ref _pendingCursor) is null || !CursorDue()) continue;
            var sample = Interlocked.Exchange(ref _pendingCursor, null);
            if (sample is null || !IsStreaming) continue;
            _lastCursorSendMs = _clock.Elapsed.TotalMilliseconds;
            await SendAsync(CursorJson(sample, _lastCursorSendMs), ct);
            CursorMessagesSent++;
        }
    }

    private bool CursorDue()
    {
        double interval = 1000.0 / Math.Clamp(CursorHz, MinCursorHz, MaxCursorHz);
        // 1 ms of slack so a 60 Hz budget isn't missed by sampler-tick phase jitter.
        return _clock.Elapsed.TotalMilliseconds - _lastCursorSendMs >= interval - 1.0;
    }

    /// <summary>Called on every sampler tick; wakes the sender if a cursor update is waiting.</summary>
    public void OnSamplerTick()
    {
        if (Volatile.Read(ref _pendingCursor) is not null && CursorDue()) Signal();
    }

    internal static string CursorJson(CursorSample s, double sentMs)
    {
        var p = s.Point;
        return Invariant($"{{\"t\":\"c\",\"x\":{p.X:0.#####},\"y\":{p.Y:0.#####},\"m\":{p.Monitor},\"mx\":{p.MX:0.#####},\"my\":{p.MY:0.#####},\"s\":{s.Seq},\"ts\":{sentMs:0.#}}}");
    }

    private async Task SendAsync(string json, CancellationToken ct)
    {
        if (_socket.State != WebSocketState.Open) return;
        await _socket.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, ct);
    }

    public async Task CloseAsync(string reason)
    {
        try
        {
            if (_socket.State == WebSocketState.Open)
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(1));
                await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, reason, cts.Token);
            }
        }
        catch (Exception) { /* already gone */ }
    }

    private static string DescribeAgent(string ua) =>
        ua.Contains("iPhone") ? "iPhone" : ua.Contains("iPad") ? "iPad" : ua.Contains("Android") ? "Android phone" : "Browser";
}
