using System.Text.Json;

namespace PeekPets.Companion.Powers;

/// <summary>Focus session: a 25/50-minute (or custom) timer the pet sits through with you.</summary>
public sealed class FocusPower : PowerBase
{
    public const int MinMinutes = 1, MaxMinutes = 180;
    private DateTime _endsAt;
    private int _minutes;

    public bool Running { get; private set; }
    public override string Key => "focus";
    public override string Label => "Focus session";
    public override string Description => "Start a focus timer from the phone. Break nudges wait until it ends; the pet celebrates when you finish.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("start", "Start a focus session", 10),
        new("stop", "Stop the focus session", 10),
    ];

    public override void Stop() => Running = false;

    public override Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        switch (command)
        {
            case "start":
                if (Args.Int(args, "minutes", MinMinutes, MaxMinutes) is not { } minutes) return Task.FromResult(CommandResult.Fail("bad_args"));
                _minutes = minutes;
                _endsAt = Now.AddMinutes(minutes);
                Running = true;
                Ctx?.Emit("started", new { minutes }, fired: false);
                Ctx?.StateChanged();
                return Task.FromResult(CommandResult.Success(Snapshot()));
            case "stop":
                bool was = Running;
                Running = false;
                if (was) Ctx?.Emit("stopped", new { minutes = _minutes, leftSec = LeftSec }, fired: false);
                Ctx?.StateChanged();
                return Task.FromResult(CommandResult.Success(Snapshot()));
        }
        return Task.FromResult(CommandResult.Fail("unknown_command"));
    }

    private int LeftSec => Running ? Math.Max(0, (int)Math.Ceiling((_endsAt - Now).TotalSeconds)) : 0;

    public override void Tick()
    {
        if (!Running || Now < _endsAt) return;
        Running = false;
        Ctx?.Emit("done", new { minutes = _minutes });
        Ctx?.Actions.Chime();
        Ctx?.StateChanged();
    }

    public override object? Snapshot() => new { running = Running, minutes = _minutes, leftSec = LeftSec, totalSec = _minutes * 60 };
}

public sealed record PetTimer(int Id, string Label, DateTime EndsAt, int TotalSec);

/// <summary>Pure timer bookkeeping: add, cancel, and pop the ones that are due.</summary>
public sealed class TimerBook
{
    public const int MaxTimers = 10;
    public const int MinSeconds = 5, MaxSeconds = 24 * 3600;
    private readonly List<PetTimer> _timers = [];
    private int _nextId = 1;

    public IReadOnlyList<PetTimer> All => _timers.OrderBy(t => t.EndsAt).ToList();

    public PetTimer? Add(DateTime now, string label, int seconds)
    {
        if (_timers.Count >= MaxTimers || seconds < MinSeconds || seconds > MaxSeconds) return null;
        var timer = new PetTimer(_nextId++, label, now.AddSeconds(seconds), seconds);
        _timers.Add(timer);
        return timer;
    }

    public bool Cancel(int id) => _timers.RemoveAll(t => t.Id == id) > 0;

    public IReadOnlyList<PetTimer> PopDue(DateTime now)
    {
        var due = _timers.Where(t => t.EndsAt <= now).OrderBy(t => t.EndsAt).ToList();
        _timers.RemoveAll(t => t.EndsAt <= now);
        return due;
    }

    public object Snapshot(DateTime now) => All.Select(t => new
    {
        id = t.Id,
        label = t.Label,
        totalSec = t.TotalSec,
        leftSec = Math.Max(0, (int)Math.Ceiling((t.EndsAt - now).TotalSeconds)),
    }).ToList();
}

/// <summary>Quick timers from the phone ("pizza in 12 min"). They ring on the phone and the PC.</summary>
public sealed class TimersPower : PowerBase
{
    private TimerBook _book = new();

    public override string Key => "timers";
    public override string Label => "Timers & reminders";
    public override string Description => "Quick timers started from the phone. The pet holds up the timer; it rings on both the phone and this PC.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("add", "Start a timer", 20),
        new("cancel", "Cancel a timer", 30),
    ];

    public override void Start(IPowerContext ctx)
    {
        base.Start(ctx);
        _book = new TimerBook();
    }

    public override Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        if (command == "add")
        {
            var label = Args.Text(args, "label", 40) ?? "Timer";
            if (Args.Int(args, "seconds", TimerBook.MinSeconds, TimerBook.MaxSeconds) is not { } seconds) return Task.FromResult(CommandResult.Fail("bad_args"));
            var timer = _book.Add(Now, label, seconds);
            if (timer is null) return Task.FromResult(CommandResult.Fail("too_many"));
            Ctx?.StateChanged();
            return Task.FromResult(CommandResult.Success(new { id = timer.Id }));
        }
        if (command == "cancel")
        {
            if (Args.Int(args, "id", 1, int.MaxValue) is not { } id) return Task.FromResult(CommandResult.Fail("bad_args"));
            bool ok = _book.Cancel(id);
            Ctx?.StateChanged();
            return Task.FromResult(ok ? CommandResult.Success() : CommandResult.Fail("not_found"));
        }
        return Task.FromResult(CommandResult.Fail("unknown_command"));
    }

    public override void Tick()
    {
        var due = _book.PopDue(Now);
        if (due.Count == 0 || Ctx is null) return;
        foreach (var t in due)
        {
            Ctx.Emit("done", new { id = t.Id, label = t.Label });
            Ctx.Actions.Toast("⏰ " + t.Label, "Your Peek Pets timer is done.");
            Ctx.Actions.Chime();
        }
        Ctx.StateChanged();
    }

    public override object? Snapshot() => new { timers = _book.Snapshot(Now) };
}
