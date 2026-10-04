using System.Text.Json;

namespace PeekPets.Companion.Powers;

/// <summary>
/// A named thing the phone may ask a power to do. Commands are a fixed allowlist: the
/// phone can only name one of these, never send code or paths. Every command needs the
/// power's PC-side permission, a one-time approval per phone, and passes a rate limit.
/// </summary>
/// <param name="Sensitive">Approval lasts only a few minutes and is never saved (e.g. reading the clipboard).</param>
/// <param name="Sensitive">asks every time (approval lasts 10 min), e.g. reading the PC clipboard.</param>
/// <param name="AskFirst">asks once even when auto-allow is on (then remembered), e.g. the microphone.</param>
public sealed record CommandSpec(string Name, string Label, int PerMinute = 20, bool Sensitive = false, bool AskFirst = false);

public sealed record CommandResult(bool Ok, string? Reason = null, object? Data = null)
{
    public static CommandResult Success(object? data = null) => new(true, null, data);
    public static CommandResult Fail(string reason) => new(false, reason);
}

/// <summary>Who is asking: an authenticated phone session.</summary>
public sealed record CommandCaller(string DeviceId, string DeviceName, string SessionId);

/// <summary>What a power can reach. Everything that touches Windows goes through <see cref="Actions"/>.</summary>
public interface IPowerContext
{
    DateTime Now { get; }
    ISystemActions Actions { get; }
    IIdleSource Idle { get; }
    /// <summary>Something happened the pet should react to. <paramref name="fired"/> counts it in the Labs scorecard.</summary>
    void Emit(string ev, object? data = null, bool fired = true);
    /// <summary>The power's snapshot changed; phones get the new one.</summary>
    void StateChanged();
    void Log(string line);
    bool IsActive(string key);
    T? Find<T>() where T : class, IPower;
    /// <summary>Small persisted per-power values (e.g. disk history).</summary>
    T? Load<T>(string name);
    void Save<T>(string name, T value);
}

public interface IPower
{
    string Key { get; }
    string Label { get; }
    string Description { get; }
    IReadOnlyList<CommandSpec> Commands { get; }
    /// <summary>Called when the power becomes active (PC allows it AND the phone switched it on).</summary>
    void Start(IPowerContext ctx);
    /// <summary>Called when it becomes inactive. Must stop all reading.</summary>
    void Stop();
    /// <summary>About once a second while active.</summary>
    void Tick();
    Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller);
    /// <summary>The phone dismissed/snoozed/completed something this power showed.</summary>
    void OnAck(string action, string? kind);
    /// <summary>Current state for the phone (only asked while active).</summary>
    object? Snapshot();
}

/// <summary>Powers that want to hear about other powers' events (e.g. the away summary).</summary>
public interface IPowerObserver
{
    void OnPowerEvent(string key, string ev, object? data);
}

public abstract class PowerBase : IPower
{
    protected IPowerContext? Ctx { get; private set; }
    public abstract string Key { get; }
    public abstract string Label { get; }
    public abstract string Description { get; }
    public virtual IReadOnlyList<CommandSpec> Commands => [];

    public virtual void Start(IPowerContext ctx) => Ctx = ctx;
    public virtual void Stop() { }
    public virtual void Tick() { }
    public virtual void OnAck(string action, string? kind) { }
    public virtual object? Snapshot() => null;

    public virtual Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller) =>
        Task.FromResult(CommandResult.Fail("unknown_command"));

    protected DateTime Now => Ctx?.Now ?? DateTime.UtcNow;
}

/// <summary>Strict readers for command arguments. Anything malformed is simply "missing".</summary>
public static class Args
{
    public static string? Str(JsonElement args, string key, int maxLength)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(key, out var v) || v.ValueKind != JsonValueKind.String) return null;
        var s = v.GetString();
        if (s is null || s.Length > maxLength) return null;
        return s;
    }

    /// <summary>A display string: control characters removed (newlines kept only if allowed), trimmed.</summary>
    public static string? Text(JsonElement args, string key, int maxLength, bool multiline = false)
    {
        var s = Str(args, key, maxLength);
        if (s is null) return null;
        var clean = new string(s.Where(c => !char.IsControl(c) || multiline && (c == '\n' || c == '\t')).ToArray()).Trim();
        return clean.Length == 0 ? null : clean;
    }

    public static int? Int(JsonElement args, string key, int min, int max)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(key, out var v) || v.ValueKind != JsonValueKind.Number) return null;
        if (!v.TryGetDouble(out var d) || double.IsNaN(d) || d < min || d > max) return null;
        return (int)Math.Round(d);
    }

    public static string? OneOf(JsonElement args, string key, params string[] allowed)
    {
        var s = Str(args, key, 32);
        return s is not null && allowed.Contains(s) ? s : null;
    }
}

public sealed class PowerScore
{
    public int Fired { get; set; }
    public int Used { get; set; }
    public int Dismissed { get; set; }
    public DateTime? LastUsed { get; set; }
}

public sealed class Favorite
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Target { get; set; } = "";
}

/// <summary>Everything powers persist, stored inside companion.json.</summary>
public sealed class PowerPrefs
{
    public Dictionary<string, bool> PcAllowed { get; set; } = new();
    public Dictionary<string, bool> PhoneOn { get; set; } = new();
    /// <summary>deviceId → approved "power.command" names.</summary>
    public Dictionary<string, List<string>> Approved { get; set; } = new();
    /// <summary>
    /// Paired phones run commands without the first-use "Allow?" dialog (sensitive ones,
    /// like reading the clipboard, still ask). On by default; switch off in the Powers tab.
    /// </summary>
    public bool AutoAllow { get; set; } = true;
    public Dictionary<string, PowerScore> Scores { get; set; } = new();
    public List<Favorite> Favorites { get; set; } = [];
    /// <summary>"power.name" → JSON value.</summary>
    public Dictionary<string, string> Data { get; set; } = new();
}
