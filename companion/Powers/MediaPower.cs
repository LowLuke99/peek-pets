using System.Text.Json;

namespace PeekPets.Companion.Powers;

/// <summary>
/// Media remote: play/pause, next/previous, volume from the phone (Windows media keys),
/// plus what's playing (title/artist/app from the Windows media session; read only).
/// </summary>
public sealed class MediaPower : PowerBase
{
    private static readonly TimeSpan PollEvery = TimeSpan.FromSeconds(2);
    private NowPlaying? _playing;
    private VolumeInfo? _volume;
    private DateTime _nextPoll;
    private int _polling;

    public override string Key => "media";
    public override string Label => "Media remote";
    public override string Description => "Play/pause, skip and volume from the phone. Shows the song title/artist Windows reports. The pet bops along.";
    public override IReadOnlyList<CommandSpec> Commands { get; } =
    [
        new("play_pause", "Play / pause media", 60),
        new("next", "Next track", 60),
        new("prev", "Previous track", 60),
        new("vol_up", "Volume up", 120),
        new("vol_down", "Volume down", 120),
        new("mute", "Mute / unmute speakers", 30),
    ];

    public override void Start(IPowerContext ctx)
    {
        base.Start(ctx);
        _playing = null;
        _nextPoll = DateTime.MinValue;
    }

    public override async Task<CommandResult> RunAsync(string command, JsonElement args, CommandCaller caller)
    {
        if (Ctx is null) return CommandResult.Fail("power_off");
        MediaKey? key = command switch
        {
            "play_pause" => MediaKey.PlayPause,
            "next" => MediaKey.Next,
            "prev" => MediaKey.Previous,
            "vol_up" => MediaKey.VolumeUp,
            "vol_down" => MediaKey.VolumeDown,
            "mute" => MediaKey.Mute,
            _ => null,
        };
        if (key is null) return CommandResult.Fail("unknown_command");
        Ctx.Actions.Media(key.Value);
        await Task.Delay(Ctx.Actions.IsDryRun ? 0 : 250); // let Windows apply it before we read back
        await RefreshAsync(force: true);
        return CommandResult.Success(Snapshot());
    }

    public override void Tick()
    {
        if (Now < _nextPoll || Interlocked.Exchange(ref _polling, 1) == 1) return;
        _nextPoll = Now + PollEvery;
        _ = Task.Run(async () =>
        {
            try { await RefreshAsync(force: false); }
            finally { Interlocked.Exchange(ref _polling, 0); }
        });
    }

    private async Task RefreshAsync(bool force)
    {
        if (Ctx is not { } ctx) return;
        NowPlaying? playing;
        try { playing = await ctx.Actions.NowPlayingAsync(); }
        catch (Exception) { playing = null; }
        var volume = ctx.Actions.Volume();
        bool startedPlaying = playing?.Playing == true && _playing?.Playing != true;
        bool stoppedPlaying = playing?.Playing != true && _playing?.Playing == true;
        bool changed = playing != _playing || volume != _volume;
        _playing = playing;
        _volume = volume;
        if (startedPlaying) ctx.Emit("playing", new { title = playing!.Title, artist = playing.Artist });
        if (stoppedPlaying) ctx.Emit("paused", null, fired: false);
        if (changed || force) ctx.StateChanged();
    }

    public override object? Snapshot() => new
    {
        playing = _playing?.Playing ?? false,
        title = _playing?.Title,
        artist = _playing?.Artist,
        app = _playing?.App,
        volume = _volume?.Percent,
        muted = _volume?.Muted,
    };
}
