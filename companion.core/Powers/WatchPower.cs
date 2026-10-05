using System.Runtime.InteropServices;
using System.Text.Json;

namespace PeekPets.Companion.Powers;

/// <summary>
/// Decides when a watched process is "done": it exited, or it was busy and then stayed
/// quiet. A process that was never busy only counts as done when it exits.
/// </summary>
public sealed class QuietDetector(double busyCpu = 10, double quietCpu = 3, int busyNeededSec = 3, int quietNeededSec = 20)
{
    private double _busySec, _quietSec;
    private DateTime? _last;

    public bool WasBusy => _busySec >= busyNeededSec;

    /// <param name="cpu">percent of one core over the last step; null = the process is gone.</param>
    public string? Step(DateTime now, double? cpu)
    {
        if (cpu is null) return "exited";
        double dt = _last is { } l ? Math.Clamp((now - l).TotalSeconds, 0, 5) : 0;
        _last = now;
        if (cpu >= busyCpu) { _busySec += dt; _quietSec = 0; }
        else if (cpu <= quietCpu) _quietSec += dt;
        else _quietSec = 0;
        return WasBusy && _quietSec >= quietNeededSec ? "quiet" : null;
    }
}

/// <summary>Decides when the Downloads folder has finished changing.</summary>
public sealed class DownloadsDetector(DateTime startedAt, int settleSec = 10, int nothingSec = 30)
{
    private bool _sawActivity;

    public string? Step(DateTime now, DateTime lastChange, int partialFiles)
    {
        if (partialFiles > 0 || lastChange > startedAt) _sawActivity = true;
        if (partialFiles > 0) return null;
        if (_sawActivity) return (now - lastChange).TotalSeconds >= settleSec ? "finished" : null;
        return (now - startedAt).TotalSeconds >= nothingSec ? "nothing" : null;
    }
}

/// <summary>"Tell me when it's done": watch a process (or the busiest one) or the Downloads folder.</summary>
public sealed class WatchPower : PowerBase
{
    public const int MaxWatches = 5;
    private static readonly string[] PartialExtensions = [".crdownload", ".part", ".partial", ".download", ".opdownload", ".tmp"];
    private readonly List<Watch> _watches = [];
    private int _nextId = 1;

    private sealed class Watch
    {
        public int Id;
        public string Kind = "process";
        public string Label = "";
        public int Pid;
        public TimeSpan? LastCpu;
        public DateTime LastAt;
        public double Cpu;
        public DateTime Started;
        public QuietDetector? Quiet;
        public DownloadsDetector? Downloads;
        public FileSystemWatcher? Fs;
        public string? Folder;
        public long LastChangeTicks;
    }

    public override string Key => "watch";
    public override string Label => "Tell me when it's done";
    public override string Description => "Watches a process you pick (or the busiest one) until it exits or goes quiet, or your Downloads folder until it stops changing. Reads process names and CPU use only.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("processes", "List busy processes", 20),
        new("watch", "Watch a process", 10),
        new("watch_busy", "Watch the busiest process", 10),
        new("watch_downloads", "Watch the Downloads folder", 10),
        new("cancel", "Stop watching", 30),
    ];

    public override void Stop()
    {
        foreach (var w in _watches) w.Fs?.Dispose();
        _watches.Clear();
    }

    public override async Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        switch (command)
        {
            case "processes":
                var list = await ProcessSampler.SampleAsync(TimeSpan.FromMilliseconds(1200));
                return CommandResult.Success(new { processes = list.Select(p => new { pid = p.Pid, name = p.Name, cpu = p.Cpu, memMb = p.MemoryMb }).ToList() });
            case "watch":
                if (Args.Int(args, "pid", 1, int.MaxValue) is not { } pid) return CommandResult.Fail("bad_args");
                return AddProcess(pid);
            case "watch_busy":
                var top = (await ProcessSampler.SampleAsync(TimeSpan.FromMilliseconds(1200), 1)).FirstOrDefault();
                if (top is null || top.Cpu < 1) return CommandResult.Fail("nothing_busy");
                return AddProcess(top.Pid);
            case "watch_downloads":
                return AddDownloads();
            case "cancel":
                if (Args.Int(args, "id", 1, int.MaxValue) is not { } id) return CommandResult.Fail("bad_args");
                var w = _watches.FirstOrDefault(x => x.Id == id);
                if (w is null) return CommandResult.Fail("not_found");
                w.Fs?.Dispose();
                _watches.Remove(w);
                Ctx?.StateChanged();
                return CommandResult.Success();
        }
        return CommandResult.Fail("unknown_command");
    }

    private CommandResult AddProcess(int pid)
    {
        if (_watches.Count >= MaxWatches) return CommandResult.Fail("too_many");
        if (_watches.Any(w => w.Kind == "process" && w.Pid == pid)) return CommandResult.Fail("already_watching");
        var cpu = ProcessSampler.CpuTime(pid, out var name);
        if (cpu is null || name is null) return CommandResult.Fail("not_found");
        var watch = new Watch
        {
            Id = _nextId++, Kind = "process", Pid = pid, Label = Pretty(name), LastCpu = cpu, LastAt = Now, Started = Now,
            Quiet = new QuietDetector(),
        };
        _watches.Add(watch);
        Ctx?.Emit("watching", new { id = watch.Id, label = watch.Label }, fired: false);
        Ctx?.StateChanged();
        return CommandResult.Success(new { id = watch.Id, label = watch.Label });
    }

    private CommandResult AddDownloads()
    {
        if (_watches.Count >= MaxWatches) return CommandResult.Fail("too_many");
        if (_watches.Any(w => w.Kind == "downloads")) return CommandResult.Fail("already_watching");
        var folder = DownloadsFolder();
        if (folder is null || !Directory.Exists(folder)) return CommandResult.Fail("not_found");
        var watch = new Watch
        {
            Id = _nextId++, Kind = "downloads", Label = "Downloads", Started = Now, Folder = folder,
            Downloads = new DownloadsDetector(Now), LastChangeTicks = DateTime.MinValue.Ticks,
        };
        try
        {
            var fs = new FileSystemWatcher(folder) { IncludeSubdirectories = false, NotifyFilter = NotifyFilters.FileName | NotifyFilters.Size | NotifyFilters.LastWrite };
            FileSystemEventHandler touch = (_, _) => Interlocked.Exchange(ref watch.LastChangeTicks, DateTime.UtcNow.Ticks);
            fs.Changed += touch; fs.Created += touch; fs.Deleted += touch;
            fs.Renamed += (_, _) => Interlocked.Exchange(ref watch.LastChangeTicks, DateTime.UtcNow.Ticks);
            fs.EnableRaisingEvents = true;
            watch.Fs = fs;
        }
        catch (Exception) { return CommandResult.Fail("error"); }
        _watches.Add(watch);
        Ctx?.Emit("watching", new { id = watch.Id, label = watch.Label }, fired: false);
        Ctx?.StateChanged();
        return CommandResult.Success(new { id = watch.Id, label = watch.Label });
    }

    public override void Tick()
    {
        if (Ctx is null || _watches.Count == 0) return;
        var done = new List<(Watch W, string Reason)>();
        foreach (var w in _watches)
        {
            string? reason = w.Kind == "process" ? StepProcess(w) : StepDownloads(w);
            if (reason is not null) done.Add((w, reason));
        }
        foreach (var (w, reason) in done)
        {
            w.Fs?.Dispose();
            _watches.Remove(w);
            var text = w.Kind == "downloads"
                ? reason == "nothing" ? "Nothing is downloading right now." : "Downloads finished."
                : reason == "exited" ? $"{w.Label} finished (closed)." : $"{w.Label} looks done (went quiet).";
            Ctx.Emit("done", new { id = w.Id, label = w.Label, kind = w.Kind, reason, text, minutes = (int)(Now - w.Started).TotalMinutes });
            if (reason != "nothing") { Ctx.Actions.Toast("✅ " + w.Label, text); Ctx.Actions.Chime(); }
        }
        Ctx.StateChanged();
    }

    private string? StepProcess(Watch w)
    {
        var cpu = ProcessSampler.CpuTime(w.Pid, out _);
        double? pct = null;
        if (cpu is { } c && w.LastCpu is { } prev)
        {
            double wall = Math.Max(0.001, (Now - w.LastAt).TotalMilliseconds);
            pct = Math.Max(0, (c - prev).TotalMilliseconds / wall * 100); // percent of one core
        }
        else if (cpu is not null) pct = 0;
        w.LastCpu = cpu;
        w.LastAt = Now;
        w.Cpu = Math.Round(pct ?? 0, 1);
        return w.Quiet!.Step(Now, pct);
    }

    private string? StepDownloads(Watch w)
    {
        int partials = 0;
        try
        {
            partials = Directory.EnumerateFiles(w.Folder!)
                .Count(f => PartialExtensions.Any(e => f.EndsWith(e, StringComparison.OrdinalIgnoreCase)));
        }
        catch (Exception) { /* folder briefly locked */ }
        var lastChange = new DateTime(Interlocked.Read(ref w.LastChangeTicks), DateTimeKind.Utc);
        w.Cpu = partials;
        return w.Downloads!.Step(Now, lastChange, partials);
    }

    public override object? Snapshot() => new
    {
        watches = _watches.Select(w => new
        {
            id = w.Id, kind = w.Kind, label = w.Label,
            cpu = w.Kind == "process" ? w.Cpu : (double?)null,
            partials = w.Kind == "downloads" ? (int)w.Cpu : (int?)null,
            busy = w.Quiet?.WasBusy ?? false,
            sinceSec = (int)(Now - w.Started).TotalSeconds,
        }).ToList(),
    };

    private static string Pretty(string processName) =>
        processName.Length == 0 ? "That app" : char.ToUpperInvariant(processName[0]) + processName[1..];

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SHGetKnownFolderPath([MarshalAs(UnmanagedType.LPStruct)] Guid id, uint flags, IntPtr token, out string path);

    public static string? DownloadsFolder()
    {
        try
        {
            return SHGetKnownFolderPath(new Guid("374DE290-123F-4565-9164-39C4925E467B"), 0, IntPtr.Zero, out var path) == 0 ? path : null;
        }
        catch (Exception) { return null; }
    }
}
