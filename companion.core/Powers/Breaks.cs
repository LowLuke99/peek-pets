namespace PeekPets.Companion.Powers;

public sealed record BreakConfig(
    int EyesEveryMin = 20, int StretchAfterMin = 90, int StretchRepeatMin = 45, int WaterEveryMin = 60,
    int BreakIdleSec = 180, int ActiveIdleSec = 60, int SnoozeMin = 10, int IgnoreAfterMin = 5);

public sealed record CoachEvent(string Ev, object Data);

/// <summary>
/// Pure break-coach logic: fed (now, time since last input) about once a second, it
/// tracks active time and decides when to suggest an eye break (20-20-20), a stretch
/// (after a long continuous stretch of activity) or water. A real break (no input for
/// a few minutes) resets the streak. Never nags: one nudge at a time, snoozable,
/// and an unanswered nudge quietly expires.
/// </summary>
public sealed class BreakCoach(BreakConfig? config = null)
{
    private readonly BreakConfig _c = config ?? new BreakConfig();
    private DateTime? _last;
    private DateTime _day;
    private double _sinceEyes, _sinceWater, _maxIdleOnBreak;
    private DateTime? _lastStretch;
    private bool _onBreak, _breakBeforeStart;
    private (string Kind, DateTime At)? _pending;
    private DateTime _snoozedUntil;
    private int _tired;

    public double StreakSec { get; private set; }
    public double TodayActiveSec { get; private set; }
    public int BreaksToday { get; private set; }
    public int SkippedToday { get; private set; }
    public string? Pending => _pending?.Kind;
    public int Tired => _tired;

    public IReadOnlyList<CoachEvent> Step(DateTime now, TimeSpan idle, bool deferNudges = false)
    {
        var events = new List<CoachEvent>();
        double dt = _last is { } last ? Math.Clamp((now - last).TotalSeconds, 0, 5) : 0;
        _last = now;
        if (now.Date != _day)
        {
            _day = now.Date;
            TodayActiveSec = 0;
            BreaksToday = 0;
            SkippedToday = 0;
        }

        double idleSec = idle.TotalSeconds;
        if (idleSec >= _c.BreakIdleSec)
        {
            if (!_onBreak) _breakBeforeStart = dt == 0; // first reading: you were already away
            _onBreak = true;
            _maxIdleOnBreak = Math.Max(_maxIdleOnBreak, idleSec);
            if (_pending is not null) _pending = null; // walked away: that counts
        }
        else if (_onBreak && idleSec < _c.ActiveIdleSec)
        {
            _onBreak = false;
            int minutes = (int)Math.Round(_maxIdleOnBreak / 60);
            _maxIdleOnBreak = 0;
            bool hadStreak = StreakSec >= 10 * 60;
            StreakSec = 0;
            _sinceEyes = 0;
            if (minutes >= 10) _sinceWater = 0;
            if (!_breakBeforeStart)
            {
                BreaksToday++;
                events.Add(new CoachEvent("break_done", new { minutes, wasLong = hadStreak }));
            }
            _breakBeforeStart = false;
        }

        if (!_onBreak && idleSec < _c.ActiveIdleSec)
        {
            StreakSec += dt;
            TodayActiveSec += dt;
            _sinceEyes += dt;
            _sinceWater += dt;
        }

        if (_pending is { } p && now - p.At > TimeSpan.FromMinutes(_c.IgnoreAfterMin))
        {
            _pending = null;
            SkippedToday++;
            ResetCounter(p.Kind, now);
            events.Add(new CoachEvent("ignored", new { kind = p.Kind }));
        }

        int tired = StreakSec >= _c.StretchAfterMin * 60 ? 2 : StreakSec >= 60 * 60 ? 1 : 0;
        if (tired != _tired)
        {
            _tired = tired;
            events.Add(new CoachEvent("tired", new { level = tired }));
        }

        if (!deferNudges && !_onBreak && _pending is null && now >= _snoozedUntil && NextNudge(now) is { } kind)
        {
            _pending = (kind, now);
            events.Add(new CoachEvent("nudge", new { kind, streakMin = (int)(StreakSec / 60), seconds = kind == "eyes" ? 20 : 0 }));
        }
        return events;
    }

    private string? NextNudge(DateTime now)
    {
        if (StreakSec >= _c.StretchAfterMin * 60 && (_lastStretch is null || now - _lastStretch > TimeSpan.FromMinutes(_c.StretchRepeatMin))) return "stretch";
        if (_sinceEyes >= _c.EyesEveryMin * 60) return "eyes";
        if (_sinceWater >= _c.WaterEveryMin * 60) return "water";
        return null;
    }

    private void ResetCounter(string kind, DateTime now)
    {
        switch (kind)
        {
            case "eyes": _sinceEyes = 0; break;
            case "water": _sinceWater = 0; break;
            case "stretch": _lastStretch = now; break;
        }
    }

    /// <summary>The phone answered the current nudge.</summary>
    public void Answer(DateTime now, string action)
    {
        if (_pending is not { } p) return;
        _pending = null;
        switch (action)
        {
            case "snooze":
                _snoozedUntil = now + TimeSpan.FromMinutes(_c.SnoozeMin); // counter kept: it comes back after
                break;
            case "skip":
            case "dismiss":
                SkippedToday++;
                ResetCounter(p.Kind, now);
                break;
            default: // done
                ResetCounter(p.Kind, now);
                if (p.Kind == "eyes") _sinceEyes = 0;
                break;
        }
    }

    public object Snapshot(DateTime now) => new
    {
        streakMin = (int)(StreakSec / 60),
        todayMin = (int)(TodayActiveSec / 60),
        breaksToday = BreaksToday,
        skippedToday = SkippedToday,
        nextEyesMin = Math.Max(0, (int)Math.Ceiling(_c.EyesEveryMin - _sinceEyes / 60)),
        tired = _tired,
        onBreak = _onBreak,
        pending = _pending?.Kind,
        snoozedSec = now < _snoozedUntil ? (int)(_snoozedUntil - now).TotalSeconds : 0,
    };
}

/// <summary>Break &amp; eye buddy: 20-20-20 eye breaks, stretch and water nudges from PC activity.</summary>
public sealed class BreakBuddy : PowerBase
{
    private BreakCoach _coach = new();
    private int _lastMinute = -1;

    public override string Key => "breaks";
    public override string Label => "Break & eye buddy";
    public override string Description => "Counts active time from keyboard/mouse activity (no keys read). Suggests 20-20-20 eye breaks, stretches and water.";

    public override void Start(IPowerContext ctx)
    {
        base.Start(ctx);
        _coach = new BreakCoach();
    }

    public override void Tick()
    {
        if (Ctx is null) return;
        bool focusing = Ctx.Find<FocusPower>() is { Running: true } && Ctx.IsActive("focus");
        foreach (var e in _coach.Step(Now, Ctx.Idle.IdleFor, deferNudges: focusing))
            Ctx.Emit(e.Ev, e.Data, fired: e.Ev == "nudge");
        int minute = (int)(_coach.StreakSec / 60);
        if (minute != _lastMinute) { _lastMinute = minute; Ctx.StateChanged(); }
    }

    public override void OnAck(string action, string? kind) => _coach.Answer(Now, action);

    public override object? Snapshot() => _coach.Snapshot(Now);
}
