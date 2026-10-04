namespace PeekPets.Companion.Powers;

public enum MediaKey { PlayPause, Next, Previous, VolumeUp, VolumeDown, Mute }

public enum OpenTarget { StorageSettings, TaskManager, DiskCleanup, DownloadsFolder, TempFolder, InboxFolder }

public sealed record NowPlaying(string? Title, string? Artist, string? App, bool Playing);

public sealed record VolumeInfo(int Percent, bool Muted);

/// <summary>
/// Every way a power can change or read the PC. The real backend talks to Windows;
/// <see cref="DryRunActions"/> records calls instead, so tests (and the e2e harness)
/// never lock the PC, change the volume or launch anything.
/// </summary>
public interface ISystemActions
{
    bool IsDryRun { get; }
    void Media(MediaKey key);
    VolumeInfo? Volume();
    /// <summary>Toggles the default microphone's mute. Returns the new state, or null if there's no mic.</summary>
    bool? ToggleMicMute();
    bool? MicMuted();
    Task<NowPlaying?> NowPlayingAsync();
    void LockPc();
    void FindCursor();
    void Open(OpenTarget target, string? selectPath = null);
    bool Launch(Favorite favorite);
    void SetClipboardText(string text);
    string? GetClipboardText();
    void Toast(string title, string body, string? openPath = null);
    void Chime();
}

/// <summary>Seconds since the last keyboard/mouse input on the PC.</summary>
public interface IIdleSource
{
    TimeSpan IdleFor { get; }
}

/// <summary>Asks the person at the PC whether a phone may use a command for the first time.</summary>
public interface IApprovalPrompt
{
    Task<bool> AskAsync(string deviceName, string powerLabel, string commandLabel);
    /// <summary>False = approvals from this prompt are never saved (test auto-approve).</summary>
    bool Remember => true;
}

public sealed class AutoApprove : IApprovalPrompt
{
    public Task<bool> AskAsync(string deviceName, string powerLabel, string commandLabel) => Task.FromResult(true);
    public bool Remember => false;
}

public sealed class Win32Idle : IIdleSource
{
    public TimeSpan IdleFor
    {
        get
        {
            var info = new Sensors.Win32.LASTINPUTINFO { cbSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<Sensors.Win32.LASTINPUTINFO>() };
            if (!Sensors.Win32.GetLastInputInfo(ref info)) return TimeSpan.Zero;
            return TimeSpan.FromMilliseconds(unchecked(Sensors.Win32.GetTickCount() - info.dwTime));
        }
    }
}

/// <summary>Idle source the test hooks can pin to a value.</summary>
public sealed class OverridableIdle(IIdleSource inner) : IIdleSource
{
    public TimeSpan? Override { get; set; }
    public TimeSpan IdleFor => Override ?? inner.IdleFor;
}

/// <summary>Records what would have happened. Used by unit tests and <c>--dry-run-actions</c>.</summary>
public sealed class DryRunActions : ISystemActions
{
    private readonly List<string> _calls = [];
    private readonly object _gate = new();
    private bool _micMuted;
    private string? _clipboard = "text copied on the PC";

    public bool IsDryRun => true;
    public NowPlaying? Playing { get; set; } = new("Test Song", "Test Artist", "Spotify", true);

    public IReadOnlyList<string> Calls { get { lock (_gate) return _calls.ToList(); } }
    private void Record(string call) { lock (_gate) _calls.Add(call); }

    public void Media(MediaKey key) => Record($"media:{key}");
    public VolumeInfo? Volume() => new(42, false);
    public bool? ToggleMicMute() { _micMuted = !_micMuted; Record($"mic:{(_micMuted ? "muted" : "live")}"); return _micMuted; }
    public bool? MicMuted() => _micMuted;
    public Task<NowPlaying?> NowPlayingAsync() => Task.FromResult(Playing);
    public void LockPc() => Record("lock");
    public void FindCursor() => Record("find_cursor");
    public void Open(OpenTarget target, string? selectPath = null) => Record($"open:{target}");
    public bool Launch(Favorite favorite) { Record($"launch:{favorite.Id}"); return true; }
    public void SetClipboardText(string text) { _clipboard = text; Record($"clipboard:{text}"); }
    public string? GetClipboardText() { Record("clipboard:read"); return _clipboard; }
    public void Toast(string title, string body, string? openPath = null) => Record($"toast:{title}|{body}");
    public void Chime() => Record("chime");
}
