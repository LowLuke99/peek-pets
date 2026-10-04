namespace PeekPets.Companion.Powers;

public sealed record DriveReading(string Name, string? Label, double FreeGb, double TotalGb)
{
    public double FreePct => TotalGb <= 0 ? 100 : FreeGb / TotalGb * 100;
}

public sealed record HealthReading(IReadOnlyList<DriveReading> Drives, int? MemoryPct, int? CpuPct, double? TempC, bool? Throttled);

public sealed record HealthAlert(string Kind, string Level, string Title, string Detail, string[] Actions, string? Subject = null);

/// <summary>
/// Pure watchdog rules. Disk alerts fire right away (and again on escalation or every
/// couple of hours); CPU/RAM/heat alerts need to be sustained so a brief spike never
/// worries the pet.
/// </summary>
public sealed class HealthRules
{
    public static readonly TimeSpan DiskRepeat = TimeSpan.FromHours(2);
    public static readonly TimeSpan LoadRepeat = TimeSpan.FromMinutes(20);
    public static readonly TimeSpan Sustain = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan HeatSustain = TimeSpan.FromSeconds(30);

    private readonly Dictionary<string, (string Level, DateTime At)> _lastAlert = new();
    private readonly Dictionary<string, DateTime> _since = new();
    private readonly Dictionary<string, HealthAlert> _current = new();

    public IReadOnlyList<HealthAlert> Current => _current.Values.ToList();

    public static string? DiskLevel(DriveReading d)
    {
        if (d.TotalGb < 8) return null; // tiny USB sticks / recovery partitions aren't worth worrying about
        // Absolute space matters more than percent on big drives (5% of 2 TB is still 100 GB).
        if (d.FreeGb < 5 || d.FreePct < 1.5) return "critical";
        if (d.FreeGb < 20 || d.FreePct < 5) return "warn";
        return null;
    }

    /// <summary>Returns the alerts that should be announced now.</summary>
    public IReadOnlyList<HealthAlert> Step(DateTime now, HealthReading r)
    {
        var fresh = new List<HealthAlert>();
        var seen = new HashSet<string>();

        foreach (var d in r.Drives)
        {
            var level = DiskLevel(d);
            if (level is null) continue;
            var key = "disk:" + d.Name;
            seen.Add(key);
            var name = d.Name.TrimEnd('\\', ':');
            var alert = new HealthAlert("disk", level,
                level == "critical" ? $"{name}: is almost full" : $"{name}: is getting full",
                $"{d.FreeGb:0.#} GB free of {d.TotalGb:0} GB ({d.FreePct:0}%)",
                ["open_storage", "open_cleanup", "space_hints"], name);
            _current[key] = alert;
            if (Due(key, level, now, DiskRepeat)) fresh.Add(alert);
        }

        Sustained("memory", r.MemoryPct >= 90, now, Sustain, seen, fresh,
            () => new HealthAlert("memory", "warn", "Memory is nearly full", $"RAM at {r.MemoryPct}%", ["open_taskmgr"]));
        Sustained("cpu", r.CpuPct >= 90, now, Sustain, seen, fresh,
            () => new HealthAlert("cpu", "warn", "The PC is working flat out", $"CPU at {r.CpuPct}%", ["open_taskmgr"]));
        Sustained("heat", r.Throttled == true || r.TempC >= 90, now, HeatSustain, seen, fresh,
            () => new HealthAlert("heat", "warn", "The PC is running hot",
                r.Throttled == true ? "Windows is slowing the CPU down to cool it" : $"About {r.TempC:0} °C", ["open_taskmgr"]));

        foreach (var key in _current.Keys.Where(k => !seen.Contains(k)).ToList()) _current.Remove(key);
        return fresh;
    }

    private void Sustained(string key, bool condition, DateTime now, TimeSpan sustain, HashSet<string> seen, List<HealthAlert> fresh, Func<HealthAlert> make)
    {
        if (!condition) { _since.Remove(key); return; }
        if (!_since.TryGetValue(key, out var since)) _since[key] = since = now;
        if (now - since < sustain) return;
        seen.Add(key);
        var alert = make();
        _current[key] = alert;
        if (Due(key, alert.Level, now, LoadRepeat)) fresh.Add(alert);
    }

    private bool Due(string key, string level, DateTime now, TimeSpan repeat)
    {
        if (_lastAlert.TryGetValue(key, out var last) && now - last.At < repeat && Rank(level) <= Rank(last.Level)) return false;
        _lastAlert[key] = (level, now);
        return true;
    }

    private static int Rank(string level) => level == "critical" ? 2 : 1;

    /// <summary>
    /// GB/day the drive is losing, from daily free-space samples ("yyyy-MM-dd" → GB).
    /// Null when there isn't enough history or it isn't shrinking.
    /// </summary>
    public static (double GbPerDay, double? DaysLeft)? FillRate(IReadOnlyDictionary<string, double> history, double freeNowGb)
    {
        var points = history
            .Select(kv => (Ok: DateTime.TryParse(kv.Key, out var d), Day: d, Gb: kv.Value))
            .Where(p => p.Ok).OrderBy(p => p.Day).ToList();
        if (points.Count < 3) return null;
        var first = points[0];
        var last = points[^1];
        double days = (last.Day - first.Day).TotalDays;
        if (days < 2) return null;
        double perDay = (first.Gb - last.Gb) / days;
        if (perDay < 0.05) return (Math.Round(perDay, 2), null);
        return (Math.Round(perDay, 2), Math.Round(freeNowGb / perDay));
    }
}
