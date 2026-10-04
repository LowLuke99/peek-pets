using System.Diagnostics;
using System.Media;
using System.Runtime.InteropServices;
using System.Windows.Threading;
using Windows.Media.Control;

namespace PeekPets.Companion.Powers;

/// <summary>The real backend: media keys, Core Audio, the Windows media session, lock, shell opens.</summary>
public sealed class WindowsActions(Dispatcher ui) : ISystemActions
{
    private const uint KEYEVENTF_EXTENDEDKEY = 0x1, KEYEVENTF_KEYUP = 0x2;
    private GlobalSystemMediaTransportControlsSessionManager? _media;

    [DllImport("user32.dll")] private static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
    [DllImport("user32.dll")] private static extern bool LockWorkStation();

    public bool IsDryRun => false;

    public void Media(MediaKey key)
    {
        byte vk = key switch
        {
            MediaKey.PlayPause => 0xB3,
            MediaKey.Next => 0xB0,
            MediaKey.Previous => 0xB1,
            MediaKey.VolumeUp => 0xAF,
            MediaKey.VolumeDown => 0xAE,
            _ => 0xAD, // mute
        };
        int presses = key is MediaKey.VolumeUp or MediaKey.VolumeDown ? 2 : 1; // one press = 2 %, two feel like a step
        for (int i = 0; i < presses; i++)
        {
            keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY, UIntPtr.Zero);
            keybd_event(vk, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
    }

    public VolumeInfo? Volume() => CoreAudio.SpeakerVolume();
    public bool? ToggleMicMute() => CoreAudio.ToggleMic();
    public bool? MicMuted() => CoreAudio.MicMuted();

    public async Task<NowPlaying?> NowPlayingAsync()
    {
        try
        {
            _media ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync();
            var session = _media.GetCurrentSession();
            if (session is null) return null;
            var props = await session.TryGetMediaPropertiesAsync();
            bool playing = session.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
            return new NowPlaying(Clip(props?.Title), Clip(props?.Artist), AppName(session.SourceAppUserModelId), playing);
        }
        catch (Exception) { return null; }
    }

    private static string? Clip(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Length > 80 ? s[..80] : s;

    private static string? AppName(string? aumid)
    {
        if (string.IsNullOrEmpty(aumid)) return null;
        var name = aumid.Split('!')[0].Split('_')[0];
        if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) name = name[..^4];
        var dot = name.LastIndexOf('.');
        if (dot >= 0 && dot < name.Length - 1) name = name[(dot + 1)..];
        return Clip(name);
    }

    public void LockPc() => LockWorkStation();

    private static readonly TimeSpan UiTimeout = TimeSpan.FromSeconds(3);
    private static string System32(string exe) => Path.Combine(Environment.SystemDirectory, exe);
    private static string Explorer => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");

    public void FindCursor() => ui.BeginInvoke(() => new Ui.CursorSpotlight().Show());

    public void Open(OpenTarget target, string? selectPath = null)
    {
        switch (target)
        {
            case OpenTarget.StorageSettings: Shell("ms-settings:storagesense"); break;
            case OpenTarget.TaskManager: Shell(System32("taskmgr.exe")); break;
            case OpenTarget.DiskCleanup: Shell(System32("cleanmgr.exe")); break;
            case OpenTarget.DownloadsFolder: if (WatchPower.DownloadsFolder() is { } d) Shell(Explorer, $"\"{d}\""); break;
            case OpenTarget.TempFolder: Shell(Explorer, $"\"{Path.GetTempPath()}\""); break;
            case OpenTarget.InboxFolder: if (selectPath is not null) Shell(Explorer, $"\"{selectPath}\""); break;
        }
    }

    public bool Launch(Favorite favorite)
    {
        if (!FavoriteRules.IsValidTarget(favorite.Target)) return false;
        return Shell(favorite.Target);
    }

    private static bool Shell(string file, string? args = null)
    {
        try
        {
            Process.Start(new ProcessStartInfo(file) { UseShellExecute = true, Arguments = args ?? "" })?.Dispose();
            return true;
        }
        catch (Exception) { return false; }
    }

    // Clipboard calls run on the UI thread with a timeout, so a busy UI can never deadlock a command.
    public void SetClipboardText(string text) => ui.Invoke(() =>
    {
        for (int i = 0; i < 3; i++)
        {
            try { System.Windows.Clipboard.SetText(text); return; }
            catch (COMException) { Thread.Sleep(30); } // another app has the clipboard open
        }
    }, System.Windows.Threading.DispatcherPriority.Normal, CancellationToken.None, UiTimeout);

    public string? GetClipboardText() => ui.Invoke(() =>
    {
        try
        {
            if (!System.Windows.Clipboard.ContainsText()) return null;
            // Password managers mark secrets as private: never hand those to a phone.
            if (System.Windows.Clipboard.ContainsData("ExcludeClipboardContentFromMonitorProcessing") ||
                System.Windows.Clipboard.ContainsData("Clipboard Viewer Ignore")) return null;
            return System.Windows.Clipboard.GetText();
        }
        catch (COMException) { return null; }
    }, System.Windows.Threading.DispatcherPriority.Normal, CancellationToken.None, UiTimeout);

    public void Toast(string title, string body, string? openPath = null) =>
        ui.BeginInvoke(() => Ui.ToastWindow.Show(title, body, openPath));

    public void Chime() => SystemSounds.Asterisk.Play();
}
