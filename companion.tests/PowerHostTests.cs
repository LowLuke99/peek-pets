using System.Text.Json;
using PeekPets.Companion.Powers;
using PeekPets.Companion.Server;
using Xunit;

namespace PeekPets.Companion.Tests;

internal sealed class FakeIdle : IIdleSource
{
    public TimeSpan IdleFor { get; set; }
}

internal sealed class FakeApprovals(bool answer = true) : IApprovalPrompt
{
    public int Asked;
    public bool Answer { get; set; } = answer;
    public TaskCompletionSource<bool>? Gate { get; set; }
    public async Task<bool> AskAsync(string deviceName, string powerLabel, string commandLabel)
    {
        Interlocked.Increment(ref Asked);
        if (Gate is not null) return await Gate.Task;
        return Answer;
    }
}

/// <summary>A minimal power for exercising the host's gatekeeping.</summary>
internal sealed class ProbePower : PowerBase
{
    public int Starts, Stops, Ticks, Runs;
    public string? LastAck;
    public override string Key => "probe";
    public override string Label => "Probe";
    public override string Description => "test";
    public override IReadOnlyList<CommandSpec> Commands { get; } = [new("poke", "Poke", 3), new("boom", "Boom", 10), new("peek", "Peek", 30, Sensitive: true)];
    public override void Start(IPowerContext ctx) { base.Start(ctx); Starts++; }
    public override void Stop() => Stops++;
    public override void Tick() => Ticks++;
    public override void OnAck(string action, string? kind) => LastAck = action;
    public void Fire() => Ctx?.Emit("nudge", new { kind = "x" });
    public override Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        Runs++;
        if (command == "boom") throw new InvalidOperationException("kaboom");
        return Task.FromResult(CommandResult.Success(new { n = Runs }));
    }
}

public sealed class PowerHostTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "peekpets-powers-" + Guid.NewGuid().ToString("N"));
    private DateTime _now = new(2026, 10, 4, 9, 0, 0, DateTimeKind.Utc);
    private static readonly CommandCaller Phone = new("dev1", "Test iPhone", "s1");
    private static readonly JsonElement NoArgs = JsonDocument.Parse("{}").RootElement;

    private (PowerHost Host, ProbePower Probe, FakeApprovals Approvals, List<object> Sent, CompanionSettings Settings) Make(bool approve = true)
    {
        var settings = CompanionSettings.Load(Path.Combine(_dir, "companion.json"));
        var probe = new ProbePower();
        var approvals = new FakeApprovals(approve);
        var host = new PowerHost(settings, [probe], new DryRunActions(), new FakeIdle(), approvals, new AuditLog(), () => _now);
        var sent = new List<object>();
        host.Broadcast = sent.Add;
        return (host, probe, approvals, sent, settings);
    }

    [Fact]
    public void A_power_runs_only_when_allowed_on_the_PC_and_switched_on_by_the_phone()
    {
        var (host, probe, _, _, _) = Make();
        Assert.False(host.IsActive("probe")); // phone side defaults to off
        host.SetPhoneOn("probe", true);
        Assert.True(host.IsActive("probe"));
        Assert.Equal(1, probe.Starts);

        host.SetPcAllowed("probe", false);
        Assert.False(host.IsActive("probe"));
        Assert.Equal(1, probe.Stops);
        host.Tick();
        Assert.Equal(0, probe.Ticks); // off = fully off
    }

    [Fact]
    public async Task Unknown_and_off_commands_are_refused_and_audited()
    {
        var (host, probe, _, _, _) = Make();
        Assert.Equal("unknown_command", (await host.RunCommandAsync(Phone, "probe", "rm -rf", NoArgs)).Reason);
        Assert.Equal("unknown_command", (await host.RunCommandAsync(Phone, "nope", "poke", NoArgs)).Reason);
        Assert.Equal("power_off", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        host.SetPhoneOn("probe", true);
        host.SetPcAllowed("probe", false);
        Assert.Equal("not_allowed", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        Assert.Equal(0, probe.Runs);
        Assert.Equal(4, host.Audit.Entries.Count);
    }

    [Fact]
    public async Task First_use_asks_the_PC_once_then_remembers_per_device()
    {
        var (host, probe, approvals, _, settings) = Make();
        host.SetPhoneOn("probe", true);
        bool pending = false;
        var first = await host.RunCommandAsync(Phone, "probe", "poke", NoArgs, () => pending = true);
        var second = await host.RunCommandAsync(Phone, "probe", "poke", NoArgs);

        Assert.True(first.Ok && second.Ok);
        Assert.True(pending);
        Assert.Equal(1, approvals.Asked);
        Assert.Equal(2, probe.Runs);
        Assert.True(host.IsApproved("dev1", "probe", "poke"));
        Assert.Contains("probe.poke", File.ReadAllText(settings.FilePath!));

        // A different phone has to be approved separately.
        await host.RunCommandAsync(new CommandCaller("dev2", "Other phone", "s2"), "probe", "poke", NoArgs);
        Assert.Equal(2, approvals.Asked);

        host.ForgetDevice("dev1");
        Assert.False(host.IsApproved("dev1", "probe", "poke"));
    }

    [Fact]
    public async Task Denied_approval_blocks_the_command_and_is_not_remembered()
    {
        var (host, probe, approvals, _, _) = Make(approve: false);
        host.SetPhoneOn("probe", true);
        Assert.Equal("denied", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        Assert.Equal(0, probe.Runs);
        approvals.Answer = true;
        _now = _now.AddMinutes(6); // past the "don't ask again" cooldown
        Assert.True((await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Ok);
        Assert.Equal(2, approvals.Asked);
    }

    [Fact]
    public async Task Concurrent_first_uses_share_one_approval_dialog()
    {
        var (host, _, approvals, _, _) = Make();
        host.SetPhoneOn("probe", true);
        approvals.Gate = new TaskCompletionSource<bool>();
        var a = host.RunCommandAsync(Phone, "probe", "poke", NoArgs);
        var b = host.RunCommandAsync(Phone, "probe", "poke", NoArgs);
        await Task.Delay(50);
        approvals.Gate.SetResult(true);
        Assert.True((await a).Ok && (await b).Ok);
        Assert.Equal(1, approvals.Asked);
    }

    [Fact]
    public async Task Commands_are_rate_limited_per_session_and_refill_over_time()
    {
        var (host, probe, _, _, _) = Make();
        host.SetPhoneOn("probe", true);
        for (int i = 0; i < 3; i++) Assert.True((await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Ok);
        Assert.Equal("rate_limited", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        _now = _now.AddSeconds(25); // poke allows 3/min → one token back after 20 s
        Assert.True((await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Ok);
        Assert.Equal(4, probe.Runs);
    }

    [Fact]
    public async Task A_crashing_power_reports_an_error_instead_of_taking_down_the_host()
    {
        var (host, _, _, _, _) = Make();
        host.SetPhoneOn("probe", true);
        var result = await host.RunCommandAsync(Phone, "probe", "boom", NoArgs);
        Assert.False(result.Ok);
        Assert.Equal("error", result.Reason);
    }

    [Fact]
    public async Task Scorecard_counts_fired_used_and_dismissed()
    {
        var (host, probe, _, sent, _) = Make();
        host.SetPhoneOn("probe", true);
        probe.Fire();
        probe.Fire();
        await host.RunCommandAsync(Phone, "probe", "poke", NoArgs);
        host.Ack("probe", "snooze", "x");
        host.Ack("probe", "evil", "x"); // unknown actions ignored

        var row = Assert.Single(host.Scorecard());
        Assert.Equal((2, 1, 1), (row.Fired, row.Used, row.Dismissed));
        Assert.Equal("snooze", probe.LastAck);
        Assert.Contains(sent, m => JsonSerializer.Serialize(m).Contains("\"t\":\"power\""));
        host.ResetScores();
        Assert.Equal(0, host.Scorecard()[0].Fired);
    }

    [Fact]
    public void Power_list_hides_state_of_inactive_powers()
    {
        var (host, _, _, _, _) = Make();
        var json = JsonSerializer.Serialize(host.ListMessage());
        Assert.Contains("\"t\":\"powers\"", json);
        Assert.Contains("\"active\":false", json);
        Assert.Contains("\"state\":null", json);
        Assert.Contains("\"name\":\"poke\"", json);
    }

    [Fact]
    public void Test_emit_only_works_for_running_powers()
    {
        var (host, _, _, sent, _) = Make();
        Assert.False(host.TestEmit("probe", "nudge", null));
        host.SetPhoneOn("probe", true);
        Assert.True(host.TestEmit("probe", "nudge", new { kind = "eyes" }));
        Assert.Contains(sent, m => JsonSerializer.Serialize(m).Contains("eyes"));
    }

    [Fact]
    public void Verdicts_read_like_plain_language()
    {
        Assert.Equal("not tried yet", Scorecard.Verdict(new ScoreRow("k", "K", true, false, 0, 0, 0, null)));
        Assert.StartsWith("★", Scorecard.Verdict(new ScoreRow("k", "K", true, true, 2, 5, 1, null)));
        Assert.StartsWith("mostly dismissed", Scorecard.Verdict(new ScoreRow("k", "K", true, true, 5, 0, 4, null)));
        Assert.Equal("blocked on PC", Scorecard.Verdict(new ScoreRow("k", "K", false, true, 5, 0, 4, null)));
    }

    [Fact]
    public void Args_reject_wrong_types_lengths_and_ranges()
    {
        var a = JsonDocument.Parse("""{"s":"hi\u0007 there","n":12,"big":1e12,"o":"inbox","bad":["x"]}""").RootElement;
        Assert.Equal("hi there", Args.Text(a, "s", 20));
        Assert.Null(Args.Text(a, "s", 3));
        Assert.Equal(12, Args.Int(a, "n", 1, 20));
        Assert.Null(Args.Int(a, "big", 1, 100));
        Assert.Null(Args.Int(a, "s", 1, 100));
        Assert.Equal("inbox", Args.OneOf(a, "o", "clipboard", "inbox"));
        Assert.Null(Args.OneOf(a, "o", "clipboard"));
        Assert.Null(Args.Str(a, "bad", 10));
    }

    [Fact]
    public async Task After_a_denial_the_phone_cannot_re_prompt_for_a_while()
    {
        var (host, _, approvals, _, _) = Make(approve: false);
        host.SetPhoneOn("probe", true);
        Assert.Equal("denied", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        _now = _now.AddSeconds(30);
        Assert.Equal("denied", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        Assert.Equal(1, approvals.Asked); // no second dialog
        _now = _now.AddMinutes(6);
        approvals.Answer = true;
        Assert.True((await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Ok);
        Assert.Equal(2, approvals.Asked);
    }

    [Fact]
    public async Task Sensitive_approvals_expire_and_are_never_saved()
    {
        var (host, _, approvals, _, settings) = Make();
        host.SetPhoneOn("probe", true);
        Assert.True((await host.RunCommandAsync(Phone, "probe", "peek", NoArgs)).Ok);
        Assert.True((await host.RunCommandAsync(Phone, "probe", "peek", NoArgs)).Ok);
        Assert.Equal(1, approvals.Asked);
        Assert.DoesNotContain("probe.peek", File.ReadAllText(settings.FilePath!));
        _now = _now.AddMinutes(11);
        Assert.True((await host.RunCommandAsync(Phone, "probe", "peek", NoArgs)).Ok);
        Assert.Equal(2, approvals.Asked);
    }

    [Fact]
    public async Task Test_auto_approve_never_persists_approvals()
    {
        var settings = CompanionSettings.Load(Path.Combine(_dir, "auto.json"));
        var host = new PowerHost(settings, [new ProbePower()], new DryRunActions(), new FakeIdle(), new AutoApprove(), new AuditLog(), () => _now);
        host.SetPhoneOn("probe", true);
        Assert.True((await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Ok);
        Assert.False(host.IsApproved("dev1", "probe", "poke"));
        Assert.DoesNotContain("probe.poke", File.ReadAllText(settings.FilePath!));
    }

    [Fact]
    public async Task Forgotten_phones_are_refused_and_never_approved()
    {
        var (host, probe, approvals, _, _) = Make();
        host.SetPhoneOn("probe", true);
        host.DeviceExists = id => false;
        Assert.Equal("not_paired", (await host.RunCommandAsync(Phone, "probe", "poke", NoArgs)).Reason);
        Assert.Equal(0, approvals.Asked);

        // Forgotten while the approval dialog was open: the answer is thrown away.
        bool paired = true;
        host.DeviceExists = _ => paired;
        approvals.Gate = new TaskCompletionSource<bool>();
        var pending = host.RunCommandAsync(Phone, "probe", "poke", NoArgs);
        await Task.Delay(30);
        paired = false;
        approvals.Gate.SetResult(true);
        Assert.False((await pending).Ok);
        Assert.False(host.IsApproved("dev1", "probe", "poke"));
        Assert.Equal(0, probe.Runs);
    }

    [Fact]
    public async Task Rate_limits_follow_the_device_across_reconnects_and_cover_unknown_commands()
    {
        var (host, _, _, _, _) = Make();
        host.SetPhoneOn("probe", true);
        for (int i = 0; i < 3; i++)
            Assert.True((await host.RunCommandAsync(Phone with { SessionId = "conn" + i }, "probe", "poke", NoArgs)).Ok);
        Assert.Equal("rate_limited", (await host.RunCommandAsync(Phone with { SessionId = "fresh" }, "probe", "poke", NoArgs)).Reason);

        var spammer = new CommandCaller("dev9", "Spammer", "x");
        var reasons = new List<string?>();
        for (int i = 0; i < PowerHost.DeviceCommandsPerMinute + 5; i++) reasons.Add((await host.RunCommandAsync(spammer, "probe", "nope" + i, NoArgs)).Reason);
        Assert.Contains("rate_limited", reasons);
        Assert.True(host.Audit.Entries.Count < 80, "repeated refusals collapse instead of flooding the log");
    }

    [Fact]
    public void Switching_is_audited_and_unchanged_switches_cost_nothing()
    {
        var (host, probe, _, sent, _) = Make();
        host.SetPhoneOn("probe", true, "Test iPhone");
        host.SetPhoneOn("probe", true, "Test iPhone");
        host.SetPhoneOn("probe", true, "Test iPhone");
        Assert.Equal(1, probe.Starts);
        Assert.Single(host.Audit.Entries, e => e.Command == "switch");
        Assert.Single(sent, m => JsonSerializer.Serialize(m).Contains("\"t\":\"powers\""));
    }

    [Fact]
    public async Task Audit_view_strips_control_characters_from_phone_supplied_names()
    {
        var (host, _, _, _, _) = Make();
        await host.RunCommandAsync(Phone, "probe\n12:00:00  iPhone → quick.lock: ok", "x", NoArgs);
        Assert.DoesNotContain('\n', host.Audit.Entries[0].Power);
    }

    [Fact]
    public void Audit_collapses_identical_repeats()
    {
        var log = new AuditLog();
        for (int i = 0; i < 50; i++) log.Add(new AuditEntry(_now.AddSeconds(i), "d", "p", "c", "rate_limited"));
        var entry = Assert.Single(log.Entries);
        Assert.Equal(50, entry.Count);
        Assert.Contains("×50", entry.ToString());
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch (IOException) { }
    }
}
