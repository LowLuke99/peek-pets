using System.Diagnostics;

namespace PeekPets.Companion.Sensors;

public sealed record CursorSample(CursorPoint Point, int Buttons, long Seq, double TimestampMs);

/// <summary>
/// Polls the cursor on a dedicated per-monitor-DPI-aware thread using a high-resolution
/// waitable timer (no global timer-resolution change). Runs only while someone is
/// listening, so an idle companion costs nothing.
/// </summary>
public sealed class CursorSampler : IDisposable
{
    public const int SampleHz = 125;
    private static readonly TimeSpan LayoutRefresh = TimeSpan.FromSeconds(2);

    private readonly Stopwatch _clock;
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

    public CursorSampler(Stopwatch clock) => _clock = clock;

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
        Win32.SetThreadDpiAwarenessContext(Win32.DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        IntPtr timer = Win32.CreateWaitableTimerExW(IntPtr.Zero, null, Win32.CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, Win32.TIMER_ALL_ACCESS);
        bool fallback = timer == IntPtr.Zero;
        if (fallback) Win32.timeBeginPeriod(1);

        Layout = DisplayLayout.Read();
        LayoutChanged?.Invoke(Layout);
        var lastLayoutCheck = _clock.Elapsed;
        int lastX = int.MinValue, lastY = int.MinValue, lastButtons = 0;
        long seq = 0;
        int ticks = 0;
        var hzWindowStart = _clock.Elapsed;
        long periodTicks = -(10_000_000 / SampleHz); // relative 100ns units

        try
        {
            while (_running)
            {
                if (fallback) Thread.Sleep(1000 / SampleHz);
                else if (Win32.SetWaitableTimer(timer, ref periodTicks, 0, IntPtr.Zero, IntPtr.Zero, false))
                    Win32.WaitForSingleObject(timer, Win32.INFINITE);
                else Thread.Sleep(8);

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
                    var fresh = DisplayLayout.Read();
                    if (!fresh.SameAs(Layout)) { Layout = fresh; LayoutChanged?.Invoke(fresh); }
                }

                int buttons = ReadButtons();
                int pressed = buttons & ~lastButtons;
                lastButtons = buttons;
                if (pressed != 0) ButtonDown?.Invoke(pressed);

                if (!Win32.GetCursorPos(out var p)) continue; // e.g. secure desktop / UAC prompt
                if (p.X == lastX && p.Y == lastY) continue;
                lastX = p.X; lastY = p.Y;

                var sample = new CursorSample(Layout.Normalize(p.X, p.Y), buttons, ++seq, now.TotalMilliseconds);
                Latest = sample;
                Moved?.Invoke(sample);
            }
        }
        finally
        {
            if (fallback) Win32.timeEndPeriod(1);
            else Win32.CloseHandle(timer);
        }
    }

    private static int ReadButtons()
    {
        int b = 0;
        if ((Win32.GetAsyncKeyState(Win32.VK_LBUTTON) & 0x8000) != 0) b |= 1;
        if ((Win32.GetAsyncKeyState(Win32.VK_RBUTTON) & 0x8000) != 0) b |= 2;
        if ((Win32.GetAsyncKeyState(Win32.VK_MBUTTON) & 0x8000) != 0) b |= 4;
        return b;
    }

    public void Dispose() { lock (_gate) { _running = false; _listeners = 0; } }
}
