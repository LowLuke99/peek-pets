using System.Collections.Concurrent;
using System.Text.Json;
using PeekPets.Companion.Server;

namespace PeekPets.Companion.Powers;

public sealed record ScoreRow(string Key, string Label, bool Allowed, bool On, int Fired, int Used, int Dismissed, DateTime? LastUsed);

/// <summary>
/// Runs the "helpful powers" experiments. A power is active only when the PC allows it
/// (companion window) AND the phone switched it on (Powers screen); otherwise it is
/// stopped and reads nothing. All phone → PC commands pass through
/// <see cref="RunCommandAsync"/>: allowlist → permission → rate limit → one-time
/// approval on the PC → run, and every attempt lands in the audit log.
/// </summary>
public sealed class PowerHost : IDisposable
{
    public const int DeviceCommandsPerMinute = 60;
    public const int MaxOpenApprovals = 3;
    public static readonly TimeSpan ApprovalTimeout = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan DeniedCooldown = TimeSpan.FromMinutes(5);
    public static readonly TimeSpan SensitiveApprovalLasts = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan LockWait = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan ScoreSaveEvery = TimeSpan.FromSeconds(10);

    private readonly CompanionSettings _settings;
    private readonly Dictionary<string, IPower> _powers;
    private readonly Dictionary<string, SemaphoreSlim> _locks;
    private readonly HashSet<string> _running = [];
    private readonly IApprovalPrompt _approvals;
    private readonly RateLimiter _limits;
    private readonly ConcurrentDictionary<string, Lazy<Task<bool>>> _pendingApprovals = new();
    private readonly ConcurrentDictionary<string, DateTime> _deniedUntil = new();
    private readonly ConcurrentDictionary<string, DateTime> _shortApprovals = new();
    private readonly SemaphoreSlim _reconcileGate = new(1, 1);
    private int _ticks;
    private readonly Func<DateTime> _now;
    private readonly object _gate = new();
    private Timer? _timer;
    private bool _scoresDirty;
    private DateTime _lastScoreSave;

    public IReadOnlyList<IPower> Powers { get; }
    public ISystemActions Actions { get; }
    public IIdleSource Idle { get; }
    public AuditLog Audit { get; }
    /// <summary>Sends a message to every authenticated phone (set by the server).</summary>
    public Action<object>? Broadcast { get; set; }
    /// <summary>Is this device still paired? (set by the server; forgotten phones lose every approval).</summary>
    public Func<string, bool>? DeviceExists { get; set; }
    public event Action? Changed;
    public event Action<string>? LogLine;

    public PowerHost(CompanionSettings settings, IEnumerable<IPower> powers, ISystemActions actions, IIdleSource idle,
        IApprovalPrompt approvals, AuditLog audit, Func<DateTime>? now = null)
    {
        _settings = settings;
        Powers = powers.ToList();
        _powers = Powers.ToDictionary(p => p.Key);
        _locks = Powers.ToDictionary(p => p.Key, _ => new SemaphoreSlim(1, 1));
        Actions = actions;
        Idle = idle;
        _approvals = approvals;
        Audit = audit;
        _now = now ?? (() => DateTime.UtcNow);
        _limits = new RateLimiter(_now);
    }

    /// <summary>Starts whatever is already enabled and the 1 Hz tick.</summary>
    public void Start()
    {
        Reconcile();
        _timer = new Timer(_ => Tick(), null, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1));
    }

    // ---------------------------------------------------------------- enablement
    public bool IsAllowed(string key) => _settings.Read(s => !s.Powers.PcAllowed.TryGetValue(key, out var v) || v); // default: allowed
    public bool IsPhoneOn(string key) => _settings.Read(s => s.Powers.PhoneOn.TryGetValue(key, out var v) && v);  // default: off
    public bool IsActive(string key) => _powers.ContainsKey(key) && IsAllowed(key) && IsPhoneOn(key);

    public void SetPcAllowed(string key, bool allowed)
    {
        if (!_powers.ContainsKey(key)) return;
        _settings.Update(s => s.Powers.PcAllowed[key] = allowed);
        Log($"{(allowed ? "Allowed" : "Blocked")} power: {_powers[key].Label}");
        Reconcile();
    }

    public void SetPhoneOn(string key, bool on, string? who = null)
    {
        if (!_powers.ContainsKey(key) || IsPhoneOn(key) == on) return; // unchanged: no disk write, no churn
        _settings.Update(s => s.Powers.PhoneOn[key] = on);
        if (who is not null) Audit.Add(new AuditEntry(_now(), who, key, "switch", on ? "switched on" : "switched off"));
        Reconcile();
    }

    /// <summary>
    /// Starts/stops powers so the running set matches what's enabled, then tells everyone.
    /// Never blocks for long: if a power is busy it is retried on the next safety pass.
    /// </summary>
    private void Reconcile()
    {
        if (!_reconcileGate.Wait(LockWait)) return;
        var changed = false;
        try
        {
            foreach (var p in Powers) changed |= ReconcileOne(p);
        }
        finally { _reconcileGate.Release(); }
        if (changed) Broadcast?.Invoke(ListMessage());
        Changed?.Invoke();
    }

    private bool ReconcileOne(IPower p)
    {
        if (IsActive(p.Key) == Running(p.Key)) return false;
        if (!_locks[p.Key].Wait(LockWait)) return false;
        try
        {
            bool want = IsActive(p.Key); // re-read under the lock: the PC may have just blocked it
            if (want == Running(p.Key)) return false;
            if (want)
            {
                p.Start(new Context(this, p));
                lock (_gate) _running.Add(p.Key);
                Log($"Power on: {p.Label}");
            }
            else
            {
                lock (_gate) _running.Remove(p.Key);
                p.Stop();
                Log($"Power off: {p.Label}");
            }
            return true;
        }
        catch (Exception ex)
        {
            Log($"{p.Label} failed to start/stop: {ex.Message}");
            return true;
        }
        finally { _locks[p.Key].Release(); }
    }

    private bool Running(string key) { lock (_gate) return _running.Contains(key); }

    /// <summary>Re-sends the power list (e.g. after favourites changed on the PC).</summary>
    public void Republish()
    {
        Broadcast?.Invoke(ListMessage());
        Changed?.Invoke();
    }

    // ---------------------------------------------------------------- messages
    public object ListMessage() => new
    {
        t = "powers",
        list = Powers.Select(p => new
        {
            key = p.Key,
            label = p.Label,
            description = p.Description,
            allowed = IsAllowed(p.Key),
            on = IsPhoneOn(p.Key),
            active = Running(p.Key),
            commands = p.Commands.Select(c => new { name = c.Name, label = c.Label }),
            state = Running(p.Key) ? SafeSnapshot(p) : null,
        }),
    };

    private object? SafeSnapshot(IPower p)
    {
        try { return p.Snapshot(); }
        catch (Exception ex) { Log($"{p.Label} snapshot failed: {ex.Message}"); return null; }
    }

    // ---------------------------------------------------------------- commands
    /// <summary>
    /// The only door from the phone into a power. <paramref name="onPending"/> fires if the
    /// person at the PC has to approve first (so the phone can say "check your PC").
    /// </summary>
    public async Task<CommandResult> RunCommandAsync(CommandCaller caller, string? powerKey, string? command, JsonElement args,
        Action? onPending = null, Func<IPower, Task<CommandResult>>? invoke = null)
    {
        powerKey ??= "";
        command ??= "";
        // Per-device budget first, so even refused/unknown commands can't flood anything.
        // Keyed by device (not connection): reconnecting doesn't refill the buckets.
        if (!_limits.TryTake($"{caller.DeviceId}|*", DeviceCommandsPerMinute)) return Deny(caller, powerKey, command, "rate_limited");
        if (DeviceExists?.Invoke(caller.DeviceId) == false) return Deny(caller, powerKey, command, "not_paired");
        if (!_powers.TryGetValue(powerKey, out var power) || power.Commands.FirstOrDefault(c => c.Name == command) is not { } spec)
            return Deny(caller, powerKey, command, "unknown_command");
        if (!IsAllowed(powerKey)) return Deny(caller, powerKey, command, "not_allowed");
        if (!IsPhoneOn(powerKey) || !Running(powerKey)) return Deny(caller, powerKey, command, "power_off");
        if (!_limits.TryTake($"{caller.DeviceId}|{powerKey}.{command}", spec.PerMinute))
            return Deny(caller, powerKey, command, "rate_limited");

        var deniedKey = $"{caller.DeviceId}|{powerKey}.{command}";
        bool recentlyDenied = _deniedUntil.TryGetValue(deniedKey, out var deniedUntil) && _now() < deniedUntil;
        if (!spec.Sensitive && !spec.AskFirst && !recentlyDenied && AutoAllow && !IsApproved(caller.DeviceId, powerKey, command))
            Audit.Add(new AuditEntry(_now(), caller.DeviceName, powerKey, command, "auto-allowed (paired phone)"));
        else if (!IsApproved(caller.DeviceId, powerKey, command, spec.Sensitive))
        {
            var key = $"{caller.DeviceId}|{powerKey}.{command}";
            if (_deniedUntil.TryGetValue(key, out var until) && _now() < until) return Deny(caller, powerKey, command, "denied");
            if (_pendingApprovals.Count >= MaxOpenApprovals && !_pendingApprovals.ContainsKey(key)) return Deny(caller, powerKey, command, "busy");
            onPending?.Invoke();
            Audit.Add(new AuditEntry(_now(), caller.DeviceName, powerKey, command, "asked PC for approval"));
            if (!await AskApprovalAsync(caller, power, spec))
            {
                _deniedUntil[key] = _now() + DeniedCooldown; // no re-prompting for a while after "Don't allow"
                return Deny(caller, powerKey, command, "denied");
            }
            if (!Running(powerKey)) return Deny(caller, powerKey, command, "power_off"); // switched off while we waited
        }

        await _locks[powerKey].WaitAsync();
        CommandResult result;
        try
        {
            result = !Running(powerKey) ? CommandResult.Fail("power_off")
                : invoke is null ? await power.RunAsync(command, args, caller) : await invoke(power);
        }
        catch (Exception ex)
        {
            Log($"{power.Label}.{command} failed: {ex.Message}");
            result = CommandResult.Fail("error");
        }
        finally { _locks[powerKey].Release(); }

        Audit.Add(new AuditEntry(_now(), caller.DeviceName, powerKey, command, result.Ok ? "ok" : result.Reason ?? "failed",
            Actions.IsDryRun ? "dry run" : null));
        if (result.Ok) Score(powerKey, s => { s.Used++; s.LastUsed = _now(); });
        return result;
    }

    private CommandResult Deny(CommandCaller caller, string power, string command, string reason)
    {
        Audit.Add(new AuditEntry(_now(), caller.DeviceName, Short(power), Short(command), reason));
        return CommandResult.Fail(reason);
    }

    /// <summary>Phone-supplied names in the audit view: no control/bidi characters, bounded length.</summary>
    private static string Short(string s)
    {
        var clean = new string(s.Where(c => !char.IsControl(c) && char.GetUnicodeCategory(c) != System.Globalization.UnicodeCategory.Format).ToArray());
        return clean.Length <= 32 ? clean : clean[..32] + "…";
    }

    public bool IsApproved(string deviceId, string power, string command, bool sensitive = false)
    {
        if (sensitive) return _shortApprovals.TryGetValue($"{deviceId}|{power}.{command}", out var until) && _now() < until;
        return _settings.Read(s => s.Powers.Approved.TryGetValue(deviceId, out var list) && list.Contains($"{power}.{command}"));
    }

    private async Task<bool> AskApprovalAsync(CommandCaller caller, IPower power, CommandSpec spec)
    {
        var key = $"{caller.DeviceId}|{power.Key}.{spec.Name}";
        // Two taps before the person answers share one dialog.
        var lazy = _pendingApprovals.GetOrAdd(key, _ => new Lazy<Task<bool>>(() => AskOnceAsync(caller, power, spec)));
        try { return await lazy.Value; }
        finally { _pendingApprovals.TryRemove(key, out _); }
    }

    private async Task<bool> AskOnceAsync(CommandCaller caller, IPower power, CommandSpec spec)
    {
        bool ok;
        try
        {
            var who = $"{caller.DeviceName} ({caller.DeviceId[..Math.Min(6, caller.DeviceId.Length)]})";
            var ask = _approvals.AskAsync(who, power.Label, spec.Label);
            ok = await Task.WhenAny(ask, Task.Delay(ApprovalTimeout)) == ask && await ask;
        }
        catch (Exception) { ok = false; }
        if (!ok) return false;
        if (DeviceExists?.Invoke(caller.DeviceId) == false) return false; // forgotten while the dialog was open
        if (spec.Sensitive || !_approvals.Remember)
        {
            _shortApprovals[$"{caller.DeviceId}|{power.Key}.{spec.Name}"] = _now() + SensitiveApprovalLasts;
            Audit.Add(new AuditEntry(_now(), caller.DeviceName, power.Key, spec.Name, "approved for 10 min"));
            return true;
        }
        _settings.Update(s =>
        {
            if (!s.Powers.Approved.TryGetValue(caller.DeviceId, out var list)) s.Powers.Approved[caller.DeviceId] = list = [];
            var name = $"{power.Key}.{spec.Name}";
            if (!list.Contains(name)) list.Add(name);
        });
        Audit.Add(new AuditEntry(_now(), caller.DeviceName, power.Key, spec.Name, "approved on PC"));
        Changed?.Invoke();
        return true;
    }

    public IReadOnlyList<string> ApprovedCommands() =>
        _settings.Read(s => s.Powers.Approved.Values.SelectMany(v => v).Distinct().OrderBy(v => v).ToList());

    /// <summary>Paired phones skip the first-use dialog for non-sensitive commands.</summary>
    public bool AutoAllow => _settings.Read(s => s.Powers.AutoAllow);

    public void SetAutoAllow(bool on)
    {
        _settings.Update(s => s.Powers.AutoAllow = on);
        Log(on ? "Auto-allow on: paired phones no longer ask first" : "Auto-allow off: phones ask the first time");
        Changed?.Invoke();
    }

    public void ResetApprovals()
    {
        _settings.Update(s => s.Powers.Approved.Clear());
        Log("Command approvals reset: phones will ask again");
        Changed?.Invoke();
    }

    public void ForgetDevice(string deviceId)
    {
        _settings.Update(s => s.Powers.Approved.Remove(deviceId));
        foreach (var key in _shortApprovals.Keys.Where(k => k.StartsWith(deviceId + "|", StringComparison.Ordinal)).ToList())
            _shortApprovals.TryRemove(key, out _);
        Changed?.Invoke();
    }

    // ---------------------------------------------------------------- feedback + events
    /// <summary>The phone dismissed/snoozed/completed a nudge from <paramref name="powerKey"/>.</summary>
    public void Ack(string? powerKey, string? action, string? kind)
    {
        if (powerKey is null || action is not ("dismiss" or "snooze" or "done" or "skip") || !_powers.TryGetValue(powerKey, out var p)) return;
        if (!Running(powerKey)) return;
        if (action is "dismiss" or "skip" or "snooze") Score(powerKey, s => s.Dismissed++);
        if (action == "done") Score(powerKey, s => { s.Used++; s.LastUsed = _now(); });
        if (!_locks[powerKey].Wait(TimeSpan.FromSeconds(2))) return; // busy power: drop the ack rather than stall the socket
        try { p.OnAck(action, kind is { Length: <= 32 } ? kind : null); }
        finally { _locks[powerKey].Release(); }
        Broadcast?.Invoke(StateMessage(p));
    }

    private void Emit(IPower p, string ev, object? data, bool fired)
    {
        if (!Running(p.Key)) return;
        if (fired) Score(p.Key, s => s.Fired++);
        Broadcast?.Invoke(new { t = "power", key = p.Key, ev, data });
        foreach (var observer in Powers.OfType<IPowerObserver>())
        {
            if (observer is IPower op && op != p && Running(op.Key))
            {
                try { observer.OnPowerEvent(p.Key, ev, data); }
                catch (Exception ex) { Log($"{op.Label} observer failed: {ex.Message}"); }
            }
        }
    }

    private object StateMessage(IPower p) => new { t = "power_state", key = p.Key, state = Running(p.Key) ? SafeSnapshot(p) : null };

    /// <summary>Test hook: make a power announce an event as if it happened.</summary>
    public bool TestEmit(string key, string ev, object? data)
    {
        if (!_powers.TryGetValue(key, out var p) || !Running(key)) return false;
        Emit(p, ev, data, fired: true);
        return true;
    }

    public void Tick()
    {
        if (++_ticks % 5 == 0) Reconcile(); // safety net: retries anything a busy power postponed
        foreach (var p in Powers)
        {
            if (!Running(p.Key) || !_locks[p.Key].Wait(0)) continue;
            try { if (Running(p.Key)) p.Tick(); }
            catch (Exception ex) { Log($"{p.Label} tick failed: {ex.Message}"); }
            finally { _locks[p.Key].Release(); }
        }
        if (_scoresDirty && _now() - _lastScoreSave > ScoreSaveEvery)
        {
            _scoresDirty = false;
            _lastScoreSave = _now();
            _settings.Update(_ => { });
        }
    }

    // ---------------------------------------------------------------- scorecard
    private void Score(string key, Action<PowerScore> change)
    {
        _settings.Update(s =>
        {
            if (!s.Powers.Scores.TryGetValue(key, out var score)) s.Powers.Scores[key] = score = new PowerScore();
            change(score);
        }, save: false);
        _scoresDirty = true;
        Changed?.Invoke();
    }

    public IReadOnlyList<ScoreRow> Scorecard() => Powers.Select(p =>
    {
        var s = _settings.Read(x => x.Powers.Scores.TryGetValue(p.Key, out var v) ? new PowerScore { Fired = v.Fired, Used = v.Used, Dismissed = v.Dismissed, LastUsed = v.LastUsed } : new PowerScore());
        return new ScoreRow(p.Key, p.Label, IsAllowed(p.Key), IsPhoneOn(p.Key), s.Fired, s.Used, s.Dismissed, s.LastUsed);
    }).ToList();

    public void ResetScores()
    {
        _settings.Update(s => s.Powers.Scores.Clear());
        Changed?.Invoke();
    }

    private void Log(string line) => LogLine?.Invoke(line);

    public void Dispose()
    {
        _timer?.Dispose();
        foreach (var p in Powers)
        {
            if (!Running(p.Key)) continue;
            try { p.Stop(); } catch (Exception) { /* shutting down */ }
        }
        lock (_gate) _running.Clear();
        if (_scoresDirty) _settings.Update(_ => { });
    }

    /// <summary>What a single power sees of the host.</summary>
    private sealed class Context(PowerHost host, IPower power) : IPowerContext
    {
        public DateTime Now => host._now();
        public ISystemActions Actions => host.Actions;
        public IIdleSource Idle => host.Idle;
        public void Emit(string ev, object? data = null, bool fired = true) => host.Emit(power, ev, data, fired);
        public void StateChanged() { if (host.Running(power.Key)) host.Broadcast?.Invoke(host.StateMessage(power)); }
        public void Log(string line) => host.Log($"{power.Label}: {line}");
        public bool IsActive(string key) => host.Running(key);
        public T? Find<T>() where T : class, IPower => host.Powers.OfType<T>().FirstOrDefault();

        public T? Load<T>(string name)
        {
            var json = host._settings.Read(s => s.Powers.Data.TryGetValue($"{power.Key}.{name}", out var v) ? v : null);
            if (json is null) return default;
            try { return JsonSerializer.Deserialize<T>(json); }
            catch (JsonException) { return default; }
        }

        public void Save<T>(string name, T value) =>
            host._settings.Update(s => s.Powers.Data[$"{power.Key}.{name}"] = JsonSerializer.Serialize(value));
    }
}
