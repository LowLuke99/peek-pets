using System.Text.Json;
using PeekPets.Companion.Server;

namespace PeekPets.Companion.Powers;

/// <summary>Favourite apps/sites are configured on the PC only; the phone just picks one by id.</summary>
public static class FavoriteRules
{
    public const int MaxFavorites = 8;
    public const int MaxLabel = 30;
    private static readonly string[] Launchable = [".exe", ".lnk", ".url", ".appref-ms"];

    public static bool IsValidTarget(string? target)
    {
        if (string.IsNullOrWhiteSpace(target) || target.Length > 1000) return false;
        if (Uri.TryCreate(target, UriKind.Absolute, out var uri) && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp))
            return true;
        if (!Path.IsPathFullyQualified(target)) return false;
        if (Directory.Exists(target)) return true;
        return File.Exists(target) && Launchable.Contains(Path.GetExtension(target).ToLowerInvariant());
    }

    public static string? CleanLabel(string? label)
    {
        if (label is null) return null;
        var clean = new string(label.Where(c => !char.IsControl(c)).ToArray()).Trim();
        return clean.Length is 0 or > MaxLabel ? null : clean;
    }
}

/// <summary>Find my cursor, lock the PC, mic mute, and a short list of favourite apps/sites.</summary>
public sealed class QuickPower(CompanionSettings settings) : PowerBase
{
    public override string Key => "quick";
    public override string Label => "Find cursor & quick actions";
    public override string Description => "Ring the cursor so you can spot it, lock the PC, toggle the microphone mute, or open a favourite app/site you set up here on the PC.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("find_cursor", "Show where the cursor is", 20),
        new("lock", "Lock this PC", 3),
        new("mic_toggle", "Mute / unmute the microphone", 20, AskFirst: true),
        new("launch", "Open a favourite app or site", 6),
    ];

    public IReadOnlyList<Favorite> Favorites() =>
        settings.Read(s => s.Powers.Favorites.Select(f => new Favorite { Id = f.Id, Label = f.Label, Target = f.Target }).ToList());

    public override Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        if (Ctx is null) return Task.FromResult(CommandResult.Fail("power_off"));
        switch (command)
        {
            case "find_cursor":
                Ctx.Actions.FindCursor();
                return Task.FromResult(CommandResult.Success());
            case "lock":
                Ctx.Emit("locking", null, fired: false);
                Ctx.Actions.LockPc();
                return Task.FromResult(CommandResult.Success());
            case "mic_toggle":
                var muted = Ctx.Actions.ToggleMicMute();
                Ctx.StateChanged();
                return Task.FromResult(muted is null ? CommandResult.Fail("no_mic") : CommandResult.Success(new { micMuted = muted }));
            case "launch":
                var id = Args.Str(args, "id", 16);
                var fav = Favorites().FirstOrDefault(f => f.Id == id);
                if (fav is null) return Task.FromResult(CommandResult.Fail("not_found"));
                if (!FavoriteRules.IsValidTarget(fav.Target)) return Task.FromResult(CommandResult.Fail("bad_target"));
                return Task.FromResult(Ctx.Actions.Launch(fav) ? CommandResult.Success(new { label = fav.Label }) : CommandResult.Fail("error"));
        }
        return Task.FromResult(CommandResult.Fail("unknown_command"));
    }

    public override object? Snapshot() => new
    {
        micMuted = Ctx?.Actions.MicMuted(),
        favorites = Favorites().Select(f => new { id = f.Id, label = f.Label }).ToList(),
    };
}

/// <summary>Collects what happened while you were away and turns it into a short greeting.</summary>
public sealed class AwayDigest(int awayAfterSec = 300, int backWithinSec = 15)
{
    private readonly List<string> _items = [];
    private int _skipped;
    private DateTime? _awaySince;

    public bool Away => _awaySince is not null;

    public void Note(string text)
    {
        if (_items.Count < 6 && !_items.Contains(text)) _items.Add(text);
    }

    public void NoteSkippedBreak() => _skipped++;

    /// <summary>Returns a summary when you come back after being away; otherwise null.</summary>
    public (int AwayMin, List<string> Items)? Step(DateTime now, TimeSpan idle, Func<string?>? extra = null)
    {
        if (_awaySince is null)
        {
            if (idle.TotalSeconds >= awayAfterSec) _awaySince = now - idle;
            return null;
        }
        if (idle.TotalSeconds > backWithinSec) return null;
        int minutes = (int)Math.Round((now - _awaySince.Value).TotalMinutes);
        _awaySince = null;
        var items = _items.ToList();
        if (_skipped > 0) items.Add(_skipped == 1 ? "1 break skipped" : $"{_skipped} breaks skipped");
        if (extra?.Invoke() is { } e) items.Add(e);
        _items.Clear();
        _skipped = 0;
        return (minutes, items);
    }
}

/// <summary>Away summary: when you come back to the PC, the pet greets you with what happened.</summary>
public sealed class AwayPower : PowerBase, IPowerObserver
{
    private AwayDigest _digest = new();
    private object? _lastSummary;

    public override string Key => "away";
    public override string Label => "Away summary";
    public override string Description => "When you come back to the PC after 5+ minutes, the pet greets you with a tiny summary (\"render finished, 2 breaks skipped, disk still low\").";

    public override void Start(IPowerContext ctx)
    {
        base.Start(ctx);
        _digest = new AwayDigest();
    }

    public void OnPowerEvent(string key, string ev, object? data)
    {
        var json = JsonSerializer.SerializeToElement(data);
        string? Str(string name) => json.ValueKind == JsonValueKind.Object && json.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
        switch (key, ev)
        {
            case ("watch", "done") when Str("reason") != "nothing": _digest.Note($"{Str("label")} finished"); break;
            case ("timers", "done"): _digest.Note($"Timer \"{Str("label")}\" went off"); break;
            case ("focus", "done"): _digest.Note("Focus session complete"); break;
            case ("handoff", "received"): _digest.Note("Something from your phone is in the inbox"); break;
            case ("breaks", "ignored"): _digest.NoteSkippedBreak(); break;
            case ("health", "alert") when Str("kind") != "disk": _digest.Note(Str("title") ?? "PC health alert"); break;
        }
    }

    public override void Tick()
    {
        if (Ctx is null) return;
        var summary = _digest.Step(Now, Ctx.Idle.IdleFor, DiskStillLow);
        if (summary is not { } s) return;
        _lastSummary = new { awayMin = s.AwayMin, items = s.Items, at = Now };
        Ctx.Emit("summary", new { awayMin = s.AwayMin, items = s.Items });
        Ctx.StateChanged();
    }

    private string? DiskStillLow()
    {
        if (Ctx is null || !Ctx.IsActive("health")) return null;
        var snap = JsonSerializer.SerializeToElement(Ctx.Find<HealthPower>()?.Snapshot());
        if (!snap.TryGetProperty("drives", out var drives)) return null;
        foreach (var d in drives.EnumerateArray())
        {
            if (d.TryGetProperty("level", out var level) && level.ValueKind == JsonValueKind.String)
                return $"{d.GetProperty("name").GetString()} still low ({d.GetProperty("freeGb").GetDouble():0.#} GB free)";
        }
        return null;
    }

    public override object? Snapshot() => new { away = _digest.Away, last = _lastSummary };
}
