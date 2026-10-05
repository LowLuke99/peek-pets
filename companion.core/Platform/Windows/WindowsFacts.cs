using System.Runtime.Versioning;
using PeekPets.Companion.Sensors;

namespace PeekPets.Companion.Facts;

/// <summary>The Windows fact providers (Win32).</summary>
[SupportedOSPlatform("windows")]
public static class WindowsFacts
{
    public static IFactProvider[] All() => [new BatteryFact(), new ActivityFact(), new SystemLoadFact()];
}

[SupportedOSPlatform("windows")]
public sealed class BatteryFact : IFactProvider
{
    public string Key => "battery";
    public string Label => "Battery";
    public string Description => "Battery level and charging state (desktops report no battery).";
    public bool DefaultShared => true;
    public TimeSpan Interval => TimeSpan.FromSeconds(20);

    public object Read()
    {
        if (!Win32.GetSystemPowerStatus(out var s)) return new { available = false, reason = "unknown" };
        bool noBattery = (s.BatteryFlag & 128) != 0 || s.BatteryFlag == 255 && s.BatteryLifePercent == 255;
        if (noBattery) return new { available = false, reason = "no_battery", pluggedIn = s.ACLineStatus == 1 };
        return new
        {
            available = true,
            percent = s.BatteryLifePercent == 255 ? (int?)null : s.BatteryLifePercent,
            charging = (s.BatteryFlag & 8) != 0,
            pluggedIn = s.ACLineStatus == 1,
            saver = s.SystemStatusFlag == 1,
        };
    }
}

[SupportedOSPlatform("windows")]
public sealed class ActivityFact : IFactProvider
{
    public string Key => "activity";
    public string Label => "Away from PC";
    public string Description => "Seconds since your last keyboard/mouse input (no keys are read).";
    public bool DefaultShared => true;
    public TimeSpan Interval => TimeSpan.FromSeconds(5);

    public object Read()
    {
        var info = new Win32.LASTINPUTINFO { cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<Win32.LASTINPUTINFO>() };
        if (!Win32.GetLastInputInfo(ref info)) return new { available = false };
        uint idleMs = unchecked(Win32.GetTickCount() - info.dwTime);
        // Bucketed to 5 s so the phone isn't told about every keystroke cadence.
        int idleSec = (int)(idleMs / 1000 / 5 * 5);
        return new { available = true, idleSec };
    }
}

[SupportedOSPlatform("windows")]
public sealed class SystemLoadFact : IFactProvider
{
    private ulong _lastIdle, _lastTotal;

    public string Key => "load";
    public string Label => "CPU & memory load";
    public string Description => "Overall CPU and memory use, as percentages.";
    public bool DefaultShared => false;
    public TimeSpan Interval => TimeSpan.FromSeconds(5);

    public object Read()
    {
        int? cpu = null;
        if (Win32.GetSystemTimes(out var idle, out var kernel, out var user))
        {
            ulong total = kernel.Value + user.Value; // kernel time includes idle time
            if (_lastTotal != 0 && total > _lastTotal)
            {
                double busy = 1.0 - (double)(idle.Value - _lastIdle) / (total - _lastTotal);
                cpu = (int)Math.Round(Math.Clamp(busy, 0, 1) * 100);
            }
            _lastIdle = idle.Value;
            _lastTotal = total;
        }
        var mem = new Win32.MEMORYSTATUSEX { dwLength = (uint)System.Runtime.InteropServices.Marshal.SizeOf<Win32.MEMORYSTATUSEX>() };
        int? memory = Win32.GlobalMemoryStatusEx(ref mem) ? (int)mem.dwMemoryLoad : null;
        return new { available = true, cpu, memory };
    }
}
