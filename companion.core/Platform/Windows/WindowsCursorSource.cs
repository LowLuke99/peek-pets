using System.Runtime.Versioning;

namespace PeekPets.Companion.Sensors;

/// <summary>
/// Windows cursor reading: per-monitor-DPI-aware (physical pixels across mixed-scale
/// monitors), paced by a high-resolution waitable timer (no global timer-resolution change).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsCursorSource : ICursorSource
{
    public ISamplePacer StartPacer(int hz)
    {
        Win32.SetThreadDpiAwarenessContext(Win32.DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        return new WaitableTimerPacer(hz);
    }

    /// <summary>Reads the live monitor list. Call from a per-monitor-DPI-aware thread.</summary>
    public DisplayLayout ReadLayout()
    {
        var list = new List<Screen>();
        Win32.EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr h, IntPtr _, ref Win32.RECT _, IntPtr _) =>
        {
            var info = new Win32.MONITORINFOEX { cbSize = System.Runtime.InteropServices.Marshal.SizeOf<Win32.MONITORINFOEX>() };
            if (Win32.GetMonitorInfo(h, ref info))
            {
                var r = info.rcMonitor;
                list.Add(new Screen(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top, (info.dwFlags & Win32.MONITORINFOF_PRIMARY) != 0));
            }
            return true;
        }, IntPtr.Zero);
        return DisplayLayout.Ordered(list);
    }

    public bool TryGetCursor(out int x, out int y)
    {
        bool ok = Win32.GetCursorPos(out var p); // fails on the secure desktop / UAC prompt
        x = p.X;
        y = p.Y;
        return ok;
    }

    public int ReadButtons()
    {
        int b = 0;
        if ((Win32.GetAsyncKeyState(Win32.VK_LBUTTON) & 0x8000) != 0) b |= 1;
        if ((Win32.GetAsyncKeyState(Win32.VK_RBUTTON) & 0x8000) != 0) b |= 2;
        if ((Win32.GetAsyncKeyState(Win32.VK_MBUTTON) & 0x8000) != 0) b |= 4;
        return b;
    }

    private sealed class WaitableTimerPacer : ISamplePacer
    {
        private readonly IntPtr _timer;
        private readonly bool _fallback;
        private readonly int _hz;
        private long _periodTicks;

        public WaitableTimerPacer(int hz)
        {
            _hz = hz;
            _periodTicks = -(10_000_000 / hz); // relative 100ns units
            _timer = Win32.CreateWaitableTimerExW(IntPtr.Zero, null, Win32.CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, Win32.TIMER_ALL_ACCESS);
            _fallback = _timer == IntPtr.Zero;
            if (_fallback) Win32.timeBeginPeriod(1);
        }

        public void Wait()
        {
            if (_fallback) Thread.Sleep(1000 / _hz);
            else if (Win32.SetWaitableTimer(_timer, ref _periodTicks, 0, IntPtr.Zero, IntPtr.Zero, false))
                Win32.WaitForSingleObject(_timer, Win32.INFINITE);
            else Thread.Sleep(8);
        }

        public void Dispose()
        {
            if (_fallback) Win32.timeEndPeriod(1);
            else Win32.CloseHandle(_timer);
        }
    }
}
