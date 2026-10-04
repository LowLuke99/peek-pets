using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using PeekPets.Companion.Sensors;

namespace PeekPets.Companion.Powers;

public interface IHealthProbe
{
    HealthReading Read();
}

/// <summary>Reads drive space, memory, CPU and (where Windows exposes it) the ACPI thermal zone.</summary>
public sealed class WindowsHealthProbe : IHealthProbe
{
    private ulong _lastIdle, _lastTotal;
    private PerformanceCounter? _temp, _passive;
    private bool _thermalTried;

    public HealthReading Read()
    {
        var drives = DriveInfo.GetDrives()
            .Where(d => d.DriveType == DriveType.Fixed && d.IsReady)
            .Select(d => new DriveReading(d.Name, SafeLabel(d), Math.Round(d.AvailableFreeSpace / 1073741824.0, 1), Math.Round(d.TotalSize / 1073741824.0, 1)))
            .ToList();
        var mem = new Win32.MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<Win32.MEMORYSTATUSEX>() };
        int? memory = Win32.GlobalMemoryStatusEx(ref mem) ? (int)mem.dwMemoryLoad : null;
        var (temp, throttled) = Thermal();
        return new HealthReading(drives, memory, Cpu(), temp, throttled);
    }

    private static string? SafeLabel(DriveInfo d)
    {
        try { return string.IsNullOrWhiteSpace(d.VolumeLabel) ? null : d.VolumeLabel; }
        catch (Exception) { return null; }
    }

    private int? Cpu()
    {
        if (!Win32.GetSystemTimes(out var idle, out var kernel, out var user)) return null;
        ulong total = kernel.Value + user.Value;
        int? cpu = null;
        if (_lastTotal != 0 && total > _lastTotal)
            cpu = (int)Math.Round(Math.Clamp(1.0 - (double)(idle.Value - _lastIdle) / (total - _lastTotal), 0, 1) * 100);
        _lastIdle = idle.Value;
        _lastTotal = total;
        return cpu;
    }

    private (double? TempC, bool? Throttled) Thermal()
    {
        if (!_thermalTried)
        {
            _thermalTried = true;
            try
            {
                var instance = new PerformanceCounterCategory("Thermal Zone Information").GetInstanceNames().FirstOrDefault();
                if (instance is not null)
                {
                    _temp = new PerformanceCounter("Thermal Zone Information", "Temperature", instance, readOnly: true);
                    _passive = new PerformanceCounter("Thermal Zone Information", "% Passive Limit", instance, readOnly: true);
                }
            }
            catch (Exception) { _temp = _passive = null; }
        }
        try
        {
            double? temp = _temp is null ? null : Math.Round(_temp.NextValue() - 273.15, 1); // reported in kelvin
            bool? throttled = _passive is null ? null : _passive.NextValue() < 100;
            if (temp is < 0 or > 150) temp = null;
            return (temp, throttled);
        }
        catch (Exception) { return (null, null); }
    }
}

/// <summary>
/// PC health watchdog: low disk space on any drive (with a "fills up in N days"
/// forecast), a RAM/CPU hog that names the app, and thermal throttling where Windows
/// reports it. The pet looks worried and offers one-tap fixes that open Windows tools.
/// </summary>
public sealed class HealthPower(IHealthProbe? probe = null) : PowerBase
{
    private static readonly TimeSpan ReadEvery = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan HintsFor = TimeSpan.FromMinutes(10);
    private readonly IHealthProbe _probe = probe ?? new WindowsHealthProbe();
    private HealthRules _rules = new();
    private HealthReading? _last;
    private DateTime _nextRead;
    private string? _hog;
    private object? _hints;
    private DateTime _hintsAt;

    public override string Key => "health";
    public override string Label => "PC health watchdog";
    public override string Description => "Warns about low disk space (and how fast it's filling), a RAM/CPU hog by app name, and overheating. Offers buttons that open Storage Settings, Disk Cleanup or Task Manager.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("open_storage", "Open Storage Settings", 6),
        new("open_cleanup", "Open Disk Cleanup", 6),
        new("open_taskmgr", "Open Task Manager", 6),
        new("open_downloads", "Open the Downloads folder", 6),
        new("open_temp", "Open the Temp folder", 6),
        new("space_hints", "Measure where disk space went", 4),
    ];

    public override void Start(IPowerContext ctx)
    {
        base.Start(ctx);
        _rules = new HealthRules();
        _nextRead = DateTime.MinValue;
        _hog = null;
    }

    public override void Tick()
    {
        if (Ctx is null || Now < _nextRead) return;
        _nextRead = Now + ReadEvery;
        HealthReading reading;
        try { reading = _probe.Read(); }
        catch (Exception ex) { Ctx.Log($"read failed: {ex.Message}"); return; }
        _last = reading;
        RecordDiskHistory(reading);
        foreach (var alert in _rules.Step(Now, reading))
        {
            if (alert.Kind is "memory" or "cpu") _ = AnnounceWithHogAsync(alert);
            else Ctx.Emit("alert", AlertData(alert));
        }
        Ctx.StateChanged();
    }

    private async Task AnnounceWithHogAsync(HealthAlert alert)
    {
        string? hog = null;
        try
        {
            hog = alert.Kind == "cpu"
                ? (await ProcessSampler.SampleAsync(TimeSpan.FromSeconds(1), 1)).FirstOrDefault()?.Name
                : ProcessSampler.TopByMemory(1).FirstOrDefault()?.Name;
        }
        catch (Exception) { /* name is a bonus */ }
        _hog = hog;
        var named = hog is null ? alert : alert with { Detail = $"{alert.Detail} · biggest: {hog}", Subject = hog };
        Ctx?.Emit("alert", AlertData(named));
    }

    private static object AlertData(HealthAlert a) => new { kind = a.Kind, level = a.Level, title = a.Title, detail = a.Detail, actions = a.Actions, subject = a.Subject };

    private void RecordDiskHistory(HealthReading r)
    {
        var system = SystemDrive(r);
        if (system is null || Ctx is null) return;
        var history = Ctx.Load<Dictionary<string, double>>("disk") ?? new();
        var day = Now.ToLocalTime().ToString("yyyy-MM-dd");
        if (history.TryGetValue(day, out var existing) && existing <= system.FreeGb) return;
        history[day] = system.FreeGb; // keep the day's lowest point
        foreach (var old in history.Keys.OrderBy(k => k).SkipLast(30).ToList()) history.Remove(old);
        Ctx.Save("disk", history);
    }

    private static DriveReading? SystemDrive(HealthReading r)
    {
        var root = Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\";
        return r.Drives.FirstOrDefault(d => string.Equals(d.Name, root, StringComparison.OrdinalIgnoreCase)) ?? r.Drives.FirstOrDefault();
    }

    public override async Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        if (Ctx is null) return CommandResult.Fail("power_off");
        switch (command)
        {
            case "open_storage": Ctx.Actions.Open(OpenTarget.StorageSettings); return CommandResult.Success();
            case "open_cleanup": Ctx.Actions.Open(OpenTarget.DiskCleanup); return CommandResult.Success();
            case "open_taskmgr": Ctx.Actions.Open(OpenTarget.TaskManager); return CommandResult.Success();
            case "open_downloads": Ctx.Actions.Open(OpenTarget.DownloadsFolder); return CommandResult.Success();
            case "open_temp": Ctx.Actions.Open(OpenTarget.TempFolder); return CommandResult.Success();
            case "space_hints":
                if (_hints is null || Now - _hintsAt > HintsFor)
                {
                    _hints = await Task.Run(SpaceHints.Measure);
                    _hintsAt = Now;
                }
                Ctx.StateChanged();
                return CommandResult.Success(_hints);
        }
        return CommandResult.Fail("unknown_command");
    }

    public override object? Snapshot()
    {
        if (_last is not { } r) return new { ready = false };
        var system = SystemDrive(r);
        var history = Ctx?.Load<Dictionary<string, double>>("disk") ?? new();
        var rate = system is null ? null : HealthRules.FillRate(history, system.FreeGb);
        return new
        {
            ready = true,
            drives = r.Drives.Select(d => new { name = d.Name.TrimEnd('\\'), label = d.Label, freeGb = d.FreeGb, totalGb = d.TotalGb, freePct = Math.Round(d.FreePct), level = HealthRules.DiskLevel(d) }),
            memory = r.MemoryPct,
            cpu = r.CpuPct,
            tempC = r.TempC,
            throttled = r.Throttled,
            hog = _hog,
            fill = rate is { } f ? new { drive = system!.Name.TrimEnd('\\'), gbPerDay = f.GbPerDay, daysLeft = f.DaysLeft } : null,
            alerts = _rules.Current.Select(AlertData),
            hints = _hints,
        };
    }
}

/// <summary>Where disk space tends to hide: the Recycle Bin, Temp and Downloads. Sizes only.</summary>
public static class SpaceHints
{
    private const int MaxFiles = 200_000;

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    private struct SHQUERYRBINFO { public int cbSize; public long i64Size; public long i64NumItems; }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHQueryRecycleBin(string? rootPath, ref SHQUERYRBINFO info);

    public static object Measure()
    {
        var bin = new SHQUERYRBINFO { cbSize = Marshal.SizeOf<SHQUERYRBINFO>() };
        double? recycle = SHQueryRecycleBin(null, ref bin) == 0 ? Gb(bin.i64Size) : null;
        var (temp, tempPartial) = FolderSize(Path.GetTempPath());
        var downloadsPath = WatchPower.DownloadsFolder();
        var (downloads, dlPartial) = downloadsPath is null ? (null, false) : FolderSize(downloadsPath);
        return new { recycleGb = recycle, tempGb = temp, downloadsGb = downloads, partial = tempPartial || dlPartial };
    }

    private static (double? Gb, bool Partial) FolderSize(string path)
    {
        if (!Directory.Exists(path)) return (null, false);
        long bytes = 0;
        int count = 0;
        var options = new EnumerationOptions { RecurseSubdirectories = true, IgnoreInaccessible = true, AttributesToSkip = FileAttributes.ReparsePoint };
        try
        {
            foreach (var f in new DirectoryInfo(path).EnumerateFiles("*", options))
            {
                try { bytes += f.Length; } catch (Exception) { }
                if (++count >= MaxFiles) return (Gb(bytes), true);
            }
        }
        catch (Exception) { return (Gb(bytes), true); }
        return (Gb(bytes), false);
    }

    private static double Gb(long bytes) => Math.Round(bytes / 1073741824.0, 2);
}
