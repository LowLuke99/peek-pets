using System.Text;
using System.Text.Json;
using PeekPets.Companion.Powers;
using PeekPets.Companion.Server;
using Xunit;

namespace PeekPets.Companion.Tests;

public sealed class BreakCoachTests
{
    private static readonly DateTime T0 = new(2026, 10, 4, 9, 0, 0, DateTimeKind.Utc);

    /// <summary>Runs the coach second by second with a given idle time, collecting events.</summary>
    private static List<CoachEvent> Run(BreakCoach c, ref DateTime now, int seconds, double idleSec = 1, bool defer = false)
    {
        var all = new List<CoachEvent>();
        for (int i = 0; i < seconds; i++)
        {
            now = now.AddSeconds(1);
            all.AddRange(c.Step(now, TimeSpan.FromSeconds(idleSec), defer));
        }
        return all;
    }

    private static string Kind(CoachEvent e) => JsonSerializer.SerializeToElement(e.Data).GetProperty("kind").GetString()!;

    [Fact]
    public void Suggests_an_eye_break_after_20_active_minutes()
    {
        var c = new BreakCoach();
        var now = T0;
        Assert.DoesNotContain(Run(c, ref now, 19 * 60), e => e.Ev == "nudge");
        var nudge = Assert.Single(Run(c, ref now, 70), e => e.Ev == "nudge");
        Assert.Equal("eyes", Kind(nudge));
        Assert.Equal("eyes", c.Pending);
    }

    [Fact]
    public void Idle_time_does_not_count_as_active()
    {
        var c = new BreakCoach();
        var now = T0;
        Run(c, ref now, 30 * 60, idleSec: 90); // away from keys but not a full break
        Assert.Equal(0, c.StreakSec);
    }

    [Fact]
    public void A_real_break_resets_the_streak_and_is_celebrated()
    {
        var c = new BreakCoach();
        var now = T0;
        Run(c, ref now, 40 * 60);
        c.Answer(now, "done");
        Run(c, ref now, 1, idleSec: 400);              // walked away for ~7 minutes
        var back = Run(c, ref now, 1, idleSec: 2);
        Assert.Contains(back, e => e.Ev == "break_done");
        Assert.True(c.StreakSec < 2, $"streak {c.StreakSec}");
        Assert.Equal(1, c.BreaksToday);
    }

    [Fact]
    public void Snooze_brings_the_nudge_back_later_and_skip_counts()
    {
        var c = new BreakCoach();
        var now = T0;
        Run(c, ref now, 20 * 60 + 5);
        c.Answer(now, "snooze");
        Assert.DoesNotContain(Run(c, ref now, 9 * 60), e => e.Ev == "nudge");
        Assert.Contains(Run(c, ref now, 90), e => e.Ev == "nudge");
        c.Answer(now, "skip");
        Assert.Equal(1, c.SkippedToday);
    }

    [Fact]
    public void An_unanswered_nudge_expires_quietly_as_ignored()
    {
        var c = new BreakCoach();
        var now = T0;
        Run(c, ref now, 20 * 60 + 5);
        var later = Run(c, ref now, 6 * 60);
        Assert.Contains(later, e => e.Ev == "ignored");
        Assert.Null(c.Pending);
    }

    [Fact]
    public void Focus_sessions_defer_nudges()
    {
        var c = new BreakCoach();
        var now = T0;
        Assert.DoesNotContain(Run(c, ref now, 30 * 60, defer: true), e => e.Ev == "nudge");
        Assert.Contains(Run(c, ref now, 2), e => e.Ev == "nudge");
    }

    [Fact]
    public void Long_stretches_make_the_pet_tired_and_suggest_a_stretch()
    {
        var c = new BreakCoach(new BreakConfig(EyesEveryMin: 1000, WaterEveryMin: 1000));
        var now = T0;
        var events = Run(c, ref now, 91 * 60);
        Assert.Contains(events, e => e.Ev == "tired");
        Assert.Equal(2, c.Tired);
        Assert.Equal("stretch", Kind(events.Last(e => e.Ev == "nudge")));
    }
}

public sealed class WatchDetectorTests
{
    private static readonly DateTime T0 = new(2026, 10, 4, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Exited_process_is_done()
    {
        Assert.Equal("exited", new QuietDetector().Step(T0, null));
    }

    [Fact]
    public void Busy_then_quiet_is_done_but_never_busy_is_not()
    {
        var d = new QuietDetector();
        var t = T0;
        for (int i = 0; i < 10; i++) Assert.Null(d.Step(t = t.AddSeconds(1), 90));
        string? result = null;
        for (int i = 0; i < 25 && result is null; i++) result = d.Step(t = t.AddSeconds(1), 0.5);
        Assert.Equal("quiet", result);

        var idle = new QuietDetector();
        for (int i = 0; i < 60; i++) Assert.Null(idle.Step(t = t.AddSeconds(1), 0.5));
    }

    [Fact]
    public void Downloads_finish_when_partial_files_are_gone_and_the_folder_settles()
    {
        var d = new DownloadsDetector(T0);
        Assert.Null(d.Step(T0.AddSeconds(5), T0.AddSeconds(5), partialFiles: 1));
        Assert.Null(d.Step(T0.AddSeconds(20), T0.AddSeconds(18), partialFiles: 0));
        Assert.Equal("finished", d.Step(T0.AddSeconds(30), T0.AddSeconds(18), partialFiles: 0));
    }

    [Fact]
    public void Downloads_says_nothing_is_downloading_when_quiet_from_the_start()
    {
        var d = new DownloadsDetector(T0);
        Assert.Null(d.Step(T0.AddSeconds(10), DateTime.MinValue, 0));
        Assert.Equal("nothing", d.Step(T0.AddSeconds(31), DateTime.MinValue, 0));
    }
}

public sealed class HealthRulesTests
{
    private static readonly DateTime T0 = new(2026, 10, 4, 9, 0, 0, DateTimeKind.Utc);
    private static HealthReading Disk(double free, double total = 475, int? cpu = 10, int? mem = 50, bool? throttled = false) =>
        new([new DriveReading("C:\\", null, free, total)], mem, cpu, null, throttled);

    [Fact]
    public void Low_disk_alerts_once_then_waits_unless_it_gets_worse()
    {
        var rules = new HealthRules();
        var first = Assert.Single(rules.Step(T0, Disk(12.9)));
        Assert.Equal(("disk", "warn"), (first.Kind, first.Level));
        Assert.Contains("12.9 GB free", first.Detail);
        Assert.Empty(rules.Step(T0.AddMinutes(10), Disk(12.5)));
        Assert.Equal("critical", Assert.Single(rules.Step(T0.AddMinutes(20), Disk(4.2))).Level); // escalation
        Assert.Empty(rules.Step(T0.AddMinutes(30), Disk(4.0)));
        Assert.Single(rules.Step(T0.AddHours(3), Disk(4.0)));                                       // repeat later
        Assert.Single(rules.Current);
    }

    [Fact]
    public void Healthy_and_tiny_drives_are_left_alone()
    {
        var rules = new HealthRules();
        Assert.Empty(rules.Step(T0, Disk(200)));
        Assert.Empty(rules.Step(T0, Disk(1, total: 4)));
        Assert.Empty(rules.Current);
    }

    [Fact]
    public void Cpu_alerts_need_to_be_sustained()
    {
        var rules = new HealthRules();
        Assert.Empty(rules.Step(T0, Disk(200, cpu: 99)));
        Assert.Empty(rules.Step(T0.AddSeconds(30), Disk(200, cpu: 99)));
        Assert.Empty(rules.Step(T0.AddSeconds(45), Disk(200, cpu: 20))); // spike over
        Assert.Empty(rules.Step(T0.AddSeconds(60), Disk(200, cpu: 99)));
        var alert = Assert.Single(rules.Step(T0.AddSeconds(125), Disk(200, cpu: 99)));
        Assert.Equal("cpu", alert.Kind);
    }

    [Fact]
    public void Throttling_is_reported_as_heat()
    {
        var rules = new HealthRules();
        rules.Step(T0, Disk(200, throttled: true));
        Assert.Equal("heat", Assert.Single(rules.Step(T0.AddSeconds(31), Disk(200, throttled: true))).Kind);
    }

    [Fact]
    public void Fill_rate_forecasts_days_left()
    {
        var history = new Dictionary<string, double> { ["2026-09-28"] = 20, ["2026-10-01"] = 17, ["2026-10-04"] = 14 };
        var rate = HealthRules.FillRate(history, 14);
        Assert.NotNull(rate);
        Assert.Equal(1.0, rate!.Value.GbPerDay);
        Assert.Equal(14, rate.Value.DaysLeft);
        Assert.Null(HealthRules.FillRate(new Dictionary<string, double> { ["2026-10-04"] = 14 }, 14));
        Assert.Null(HealthRules.FillRate(new Dictionary<string, double> { ["2026-10-01"] = 10, ["2026-10-02"] = 12, ["2026-10-04"] = 15 }, 15)!.Value.DaysLeft);
    }
}

public sealed class SmallLogicTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "peekpets-inbox-" + Guid.NewGuid().ToString("N"));
    private static readonly DateTime T0 = new(2026, 10, 4, 9, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Timers_pop_in_order_and_respect_limits()
    {
        var book = new TimerBook();
        var pizza = book.Add(T0, "pizza", 720)!;
        var tea = book.Add(T0, "tea", 180)!;
        Assert.Null(book.Add(T0, "x", 2));
        Assert.Empty(book.PopDue(T0.AddSeconds(100)));
        Assert.Equal("tea", Assert.Single(book.PopDue(T0.AddSeconds(200))).Label);
        Assert.True(book.Cancel(pizza.Id));
        Assert.Empty(book.All);
        for (int i = 0; i < TimerBook.MaxTimers; i++) Assert.NotNull(book.Add(T0, "t", 60));
        Assert.Null(book.Add(T0, "one too many", 60));
        _ = tea;
    }

    [Theory]
    [InlineData(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }, "jpg")]
    [InlineData(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }, "png")]
    [InlineData(new byte[] { 0x4D, 0x5A, 0x90, 0x00 }, null)] // "MZ" = a Windows executable
    [InlineData(new byte[] { 0x3C, 0x68, 0x74, 0x6D, 0x6C }, null)] // "<html"
    public void Inbox_identifies_images_by_their_bytes(byte[] head, string? expected)
    {
        Assert.Equal(expected, InboxStore.SniffImage(head));
        var heic = new byte[] { 0, 0, 0, 0x18 }.Concat("ftypheic"u8.ToArray()).ToArray();
        Assert.Equal("heic", InboxStore.SniffImage(heic));
    }

    [Fact]
    public async Task Inbox_saves_images_with_its_own_names_and_refuses_everything_else()
    {
        var inbox = new InboxStore(_dir, () => T0);
        var jpg = new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3 };
        var a = await inbox.SaveImageAsync(new MemoryStream(jpg));
        var b = await inbox.SaveImageAsync(new MemoryStream(jpg));
        Assert.EndsWith("Photo 2026-10-04 09.00.00.jpg", a);
        Assert.EndsWith("(2).jpg", b);
        Assert.Null(await inbox.SaveImageAsync(new MemoryStream(Encoding.ASCII.GetBytes("MZ fake exe"))));
        Assert.Null(await inbox.SaveImageAsync(new MemoryStream(new byte[InboxStore.MaxImageBytes + 10])));
        Assert.Equal(2, Directory.GetFiles(_dir).Length);
        var note = inbox.SaveText("hello from the phone");
        Assert.EndsWith(".txt", note);
        Assert.Contains("hello", File.ReadAllText(note));
    }

    [Fact]
    public void Favourites_accept_only_web_addresses_and_real_apps()
    {
        Assert.True(FavoriteRules.IsValidTarget("https://youtube.com"));
        Assert.True(FavoriteRules.IsValidTarget(Environment.GetFolderPath(Environment.SpecialFolder.Windows)));
        Assert.True(FavoriteRules.IsValidTarget(Path.Combine(Environment.SystemDirectory, "notepad.exe")));
        Assert.False(FavoriteRules.IsValidTarget("file:///C:/Windows/System32/cmd.exe"));
        Assert.False(FavoriteRules.IsValidTarget("javascript:alert(1)"));
        Assert.False(FavoriteRules.IsValidTarget("notepad.exe")); // relative: could resolve anywhere
        Assert.False(FavoriteRules.IsValidTarget(Path.Combine(Environment.SystemDirectory, "drivers", "etc", "hosts")));
        Assert.False(FavoriteRules.IsValidTarget(@"C:\nope\missing.exe"));
        Assert.Null(FavoriteRules.CleanLabel(new string('x', 40)));
        Assert.Equal("Music", FavoriteRules.CleanLabel(" Music\n"));
    }

    [Fact]
    public void Away_digest_greets_you_with_what_happened()
    {
        var d = new AwayDigest();
        var t = T0;
        Assert.Null(d.Step(t, TimeSpan.FromSeconds(30)));
        Assert.Null(d.Step(t = t.AddMinutes(6), TimeSpan.FromMinutes(6)));
        Assert.True(d.Away);
        d.Note("Blender finished");
        d.NoteSkippedBreak();
        d.NoteSkippedBreak();
        var summary = d.Step(t = t.AddMinutes(14), TimeSpan.FromSeconds(3), () => "C: still low (12.9 GB free)");
        Assert.NotNull(summary);
        Assert.InRange(summary!.Value.AwayMin, 19, 21);
        Assert.Equal(["Blender finished", "2 breaks skipped", "C: still low (12.9 GB free)"], summary.Value.Items);
        Assert.Null(d.Step(t.AddSeconds(5), TimeSpan.FromSeconds(1))); // only once
    }

    [Fact]
    public async Task Focus_and_timer_powers_finish_and_announce()
    {
        var settings = CompanionSettings.Load(Path.Combine(_dir, "companion.json"));
        var now = T0;
        var actions = new DryRunActions();
        var host = new PowerHost(settings, PowerCatalog.Create(settings), actions, new FakeIdle(), new AutoApprove(), new AuditLog(), () => now);
        var sent = new List<string>();
        host.Broadcast = m => sent.Add(JsonSerializer.Serialize(m));
        host.SetPhoneOn("focus", true);
        host.SetPhoneOn("timers", true);
        var caller = new CommandCaller("d", "Phone", "s");
        Assert.True((await host.RunCommandAsync(caller, "focus", "start", JsonDocument.Parse("""{"minutes":25}""").RootElement)).Ok);
        Assert.Equal("bad_args", (await host.RunCommandAsync(caller, "timers", "add", JsonDocument.Parse("""{"seconds":"lots"}""").RootElement)).Reason);
        Assert.True((await host.RunCommandAsync(caller, "timers", "add", JsonDocument.Parse("""{"label":"pizza","seconds":720}""").RootElement)).Ok);

        now = now.AddMinutes(13);
        host.Tick();
        Assert.Contains(sent, s => s.Contains("\"key\":\"timers\"") && s.Contains("\"ev\":\"done\"") && s.Contains("pizza"));
        Assert.Contains(actions.Calls, c => c.StartsWith("toast:") && c.Contains("pizza"));
        now = now.AddMinutes(13);
        host.Tick();
        Assert.Contains(sent, s => s.Contains("\"key\":\"focus\"") && s.Contains("\"ev\":\"done\""));
        host.Dispose();
    }

    [Fact]
    public async Task Handoff_text_reaches_the_clipboard_and_media_keys_are_pressed()
    {
        var settings = CompanionSettings.Load(Path.Combine(_dir, "companion.json"));
        var actions = new DryRunActions();
        var host = new PowerHost(settings, PowerCatalog.Create(settings, inbox: new InboxStore(_dir)), actions, new FakeIdle(), new AutoApprove(), new AuditLog());
        host.SetPhoneOn("handoff", true);
        host.SetPhoneOn("media", true);
        host.SetPhoneOn("quick", true);
        var caller = new CommandCaller("d", "Phone", "s");
        Assert.True((await host.RunCommandAsync(caller, "handoff", "send_text", JsonDocument.Parse("""{"text":"hi PC","to":"clipboard"}""").RootElement)).Ok);
        var grab = await host.RunCommandAsync(caller, "handoff", "grab_clipboard", default);
        Assert.Contains("hi PC", JsonSerializer.Serialize(grab.Data));
        Assert.True((await host.RunCommandAsync(caller, "media", "play_pause", default)).Ok);
        Assert.True((await host.RunCommandAsync(caller, "quick", "lock", default)).Ok);
        Assert.Equal("not_found", (await host.RunCommandAsync(caller, "quick", "launch", JsonDocument.Parse("""{"id":"zzz"}""").RootElement)).Reason);
        Assert.Contains("clipboard:hi PC", actions.Calls);
        Assert.Contains("media:PlayPause", actions.Calls);
        Assert.Contains("lock", actions.Calls); // dry run: this PC was not actually locked
        host.Dispose();
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch (IOException) { }
    }
}
