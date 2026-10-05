using System.Diagnostics;
using System.Runtime.Versioning;
using PeekPets.Companion.Facts;

namespace PeekPets.Companion.Platform.Mac;

/// <summary>The macOS fact providers. Same keys and value shapes as the Windows ones.</summary>
[SupportedOSPlatform("macos")]
public static class MacFacts
{
    public static IFactProvider[] All() => [new MacBatteryFact(), new MacActivityFact(), new MacLoadFact()];
}

[SupportedOSPlatform("macos")]
public sealed class MacBatteryFact : IFactProvider
{
    private static readonly TimeSpan CommandTimeout = TimeSpan.FromSeconds(3);

    public string Key => "battery";
    public string Label => "Battery";
    public string Description => "Battery level and charging state (desktops report no battery).";
    public bool DefaultShared => true;
    public TimeSpan Interval => TimeSpan.FromSeconds(20);

    public object Read()
    {
        var batt = Run("-g", "batt");
        if (batt is null) return new { available = false, reason = "unknown" };
        return PmsetParser.Parse(batt, PmsetParser.LowPowerMode(Run("-g")));
    }

    private static string? Run(params string[] args)
    {
        try
        {
            var psi = new ProcessStartInfo("/usr/bin/pmset") { RedirectStandardOutput = true, UseShellExecute = false };
            foreach (var a in args) psi.ArgumentList.Add(a);
            using var p = Process.Start(psi);
            if (p is null) return null;
            var output = p.StandardOutput.ReadToEndAsync();
            if (!p.WaitForExit(CommandTimeout)) { p.Kill(); return null; }
            return output.Result;
        }
        catch (Exception ex) when (ex is System.ComponentModel.Win32Exception or InvalidOperationException) { return null; }
    }
}

[SupportedOSPlatform("macos")]
public sealed class MacActivityFact : IFactProvider
{
    public string Key => "activity";
    public string Label => "Away from Mac";
    public string Description => "Seconds since your last keyboard/mouse input (no keys are read).";
    public bool DefaultShared => true;
    public TimeSpan Interval => TimeSpan.FromSeconds(5);

    public object Read()
    {
        double idle = MacNative.CGEventSourceSecondsSinceLastEventType(MacNative.CombinedSessionState, MacNative.AnyInputEvent);
        if (double.IsNaN(idle) || idle < 0) return new { available = false };
        // Bucketed to 5 s so the phone isn't told about every keystroke cadence.
        int idleSec = (int)(idle / 5) * 5;
        return new { available = true, idleSec };
    }
}

/// <summary>Not read on macOS yet (Phase 2); listed so the sharing toggle and phone sheet match Windows.</summary>
[SupportedOSPlatform("macos")]
public sealed class MacLoadFact : IFactProvider
{
    public string Key => "load";
    public string Label => "CPU & memory load";
    public string Description => "Overall CPU and memory use, as percentages (not on Mac yet).";
    public bool DefaultShared => false;
    public TimeSpan Interval => TimeSpan.FromSeconds(30);

    public object Read() => new { available = false, reason = "unsupported" };
}
