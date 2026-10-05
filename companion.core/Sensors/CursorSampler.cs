using System.Diagnostics;

namespace PeekPets.Companion.Sensors;

public sealed record CursorSample(CursorPoint Point, int Buttons, long Seq, double TimestampMs);

/// <summary>
/// Polls the cursor on a dedicated thread at <see cref="SampleHz"/>, using the OS-specific
/// <see cref="ICursorSource"/> for position, buttons, monitors and pacing. Runs only while
/// someone is listening, so an idle companion costs nothing.
/// </summary>
public sealed class CursorSampler : IDisposable
{
    public const int SampleHz = 125;
    private static readonly TimeSpan LayoutRefresh = TimeSpan.FromSeconds(2);

    private readonly Stopwatch _clock;
    private readonly ICursorSource _source;
    private readonly object _gate = new();
    private Thread? _thread;
    private volatile bool _running;
    private int _listeners;

    public event Action<CursorSample>? Moved;
    public event Action<int>? ButtonDown;           // bitmask of newly pressed buttons
    public event Action<DisplayLayout>? LayoutChanged;
    /// <summary>Raised every sample period; sessions use it as a precise send clock.</summary>
    public event Action? Tick;

    public DisplayLayout Layout { get; private set; } = new([new Screen(0, 0, 1920, 1080, true)]);
    public CursorSample? Latest { get; private set; }
    public double MeasuredHz { get; private set; }

    public CursorSampler(Stopwatch clock, ICursorSource source)
    {
        _clock = clock;
        _source = source;
    }

    public void AddListener()
    {
        lock (_gate)
        {
            _listeners++;
            if (_running) return;
            _running = true;
            _thread = new Thread(Loop) { IsBackground = true, Name = "CursorSampler", Priority = ThreadPriority.AboveNormal };
            _thread.Start();
        }
    }

    public void RemoveListener()
    {
        lock (_gate)
        {
            _listeners = Math.Max(0, _listeners - 1);
            if (_listeners == 0) _running = false;
        }
    }

    private void Loop()
    {
        using var pacer = _source.StartPacer(SampleHz); // on this thread: Windows sets per-monitor DPI here
        Layout = _source.ReadLayout();
        LayoutChanged?.Invoke(Layout);
        var lastLayoutCheck = _clock.Elapsed;
        int lastX = int.MinValue, lastY = int.MinValue, lastButtons = 0;
        long seq = 0;
        int ticks = 0;
        var hzWindowStart = _clock.Elapsed;

        while (_running)
        {
            pacer.Wait();

            ticks++;
            var now = _clock.Elapsed;
            Tick?.Invoke();
            if (now - hzWindowStart >= TimeSpan.FromSeconds(1))
            {
                MeasuredHz = ticks / (now - hzWindowStart).TotalSeconds;
                ticks = 0;
                hzWindowStart = now;
            }

            if (now - lastLayoutCheck >= LayoutRefresh)
            {
                lastLayoutCheck = now;
                var fresh = _source.ReadLayout();
                if (!fresh.SameAs(Layout)) { Layout = fresh; LayoutChanged?.Invoke(fresh); }
            }

            int buttons = _source.ReadButtons();
            int pressed = buttons & ~lastButtons;
            lastButtons = buttons;
            if (pressed != 0) ButtonDown?.Invoke(pressed);

            if (!_source.TryGetCursor(out int x, out int y)) continue; // e.g. secure desktop / UAC prompt
            if (x == lastX && y == lastY) continue;
            lastX = x; lastY = y;

            var sample = new CursorSample(Layout.Normalize(x, y), buttons, ++seq, now.TotalMilliseconds);
            Latest = sample;
            Moved?.Invoke(sample);
        }
    }

    public void Dispose() { lock (_gate) { _running = false; _listeners = 0; } }
}
