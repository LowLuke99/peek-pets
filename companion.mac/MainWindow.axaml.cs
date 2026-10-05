using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Threading;
using PeekPets.Companion.Platform.Mac;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;
using QRCoder;

namespace PeekPets.Companion.Mac;

public partial class MainWindow : Window
{
    private const int MaxLogLines = 9;
    private const double EyeReachPx = 2.2;
    private const double EyeReachDistance = 300;
    private static readonly TimeSpan SnapshotDelay = TimeSpan.FromSeconds(1.5);

    private readonly PetServer _server = null!;
    private readonly Pairing _pairing = null!;
    private readonly CompanionSettings _settings = null!;
    private readonly CursorSampler _sampler = null!;
    private readonly MacCursorSource _eyes = new();
    private readonly Queue<string> _log = new();
    private readonly DispatcherTimer _slowTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _eyeTimer = new() { Interval = TimeSpan.FromMilliseconds(33) };
    private string _baseUrl = "";
    private Point _pupilL, _pupilR;

    // For the Avalonia designer only.
    public MainWindow() => InitializeComponent();

    public MainWindow(PetServer server, Pairing pairing, CompanionSettings settings, CursorSampler sampler)
    {
        InitializeComponent();
        _server = server;
        _pairing = pairing;
        _settings = settings;
        _sampler = sampler;
        _pupilL = new Point(Canvas.GetLeft(PupilL), Canvas.GetTop(PupilL));
        _pupilR = new Point(Canvas.GetLeft(PupilR), Canvas.GetTop(PupilR));

        _server.SessionsChanged += () => Dispatcher.UIThread.Post(RefreshPhones);
        _server.Log += line => Dispatcher.UIThread.Post(() => AddLog(line));
        _server.PetEvent += (phone, name) => Dispatcher.UIThread.Post(() => AddLog($"{phone}: {Describe(name)}"));
        _pairing.CodeChanged += () => Dispatcher.UIThread.Post(RefreshPairing);
        _pairing.DevicesChanged += () => Dispatcher.UIThread.Post(RefreshPhones);

        BuildShareToggles();
        _slowTimer.Tick += (_, _) => OnSlowTick();
        _eyeTimer.Tick += (_, _) => FollowCursor();
        _eyeTimer.Start();
        PropertyChanged += (_, e) =>
        {
            if (e.Property != WindowStateProperty) return;
            if (WindowState == WindowState.Minimized) _eyeTimer.Stop(); else _eyeTimer.Start();
        };
    }

    public void OnServerStarted()
    {
        var lan = NetworkInfo.LanAddresses();
        var ip = lan.FirstOrDefault()?.Address.ToString() ?? "localhost";
        _baseUrl = $"http://{ip}:{_server.Port}/";
        UrlText.Text = _baseUrl.TrimEnd('/');
        NetworkText.Text = lan.Count == 0
            ? "No Wi-Fi/Ethernet address found. Connect this Mac to the same Wi-Fi as your phone."
            : string.Join("\n", lan.Select(a => $"{a.Address}  ·  {a.Interface}")) + $"\nPort {_server.Port}"
              + (_server.MdnsStatus is { } mdns ? $"\niPhone app: {mdns}" : "")
              + "\nIf macOS asks to accept incoming connections, click Allow.";
        RefreshPairing();
        RefreshPhones();
        _slowTimer.Start();
        AddLog("Companion ready. Waiting for your phone.");
    }

    public void OnServerFailed(string message) => Dispatcher.UIThread.Post(() =>
    {
        StatusDot.Fill = (IBrush)this.FindResource("Warn")!;
        StatusText.Text = "Not running";
        AddLog(message);
    });

    private void RefreshPairing()
    {
        CodeText.Text = Pairing.Format(_pairing.Code);
        if (_baseUrl.Length == 0) return;
        QrImage.Source = RenderQr($"{_baseUrl}#pair={_pairing.Code}");
        if (_server.SecureEnabled)
        {
            InstallQr.Source = RenderQr($"{_baseUrl}install.html#pair={_pairing.Code}");
            SecureText.Text = $"Secure app address: https://{new Uri(_baseUrl).Host}:{_server.SecurePort}\n" +
                $"Before trusting it on the iPhone, check its SHA-256 fingerprint (profile → More Details) starts with {_server.CaFingerprintShort}";
        }
        else InstallCard.IsVisible = false;
        UpdateExpiry();
    }

    private void UpdateExpiry()
    {
        var left = _pairing.CodeExpiresAt - DateTime.UtcNow;
        ExpiryText.Text = left > TimeSpan.Zero ? $"Code works for {left.Minutes}:{left.Seconds:00} more" : "Code expired, making a new one…";
    }

    private void OnSlowTick()
    {
        _pairing.RefreshIfExpired();
        UpdateExpiry();
        RefreshPhones();
    }

    private void RefreshPhones()
    {
        var sessions = _server.Sessions.Where(s => s.IsAuthed).ToList();
        NoPhonesText.IsVisible = sessions.Count == 0;
        PhoneList.Children.Clear();
        foreach (var s in sessions) PhoneList.Children.Add(PhoneRow(s));

        int paired = _pairing.Devices.Count;
        bool live = sessions.Count > 0;
        StatusDot.Fill = (IBrush)this.FindResource(live ? "Good" : "Warn")!;
        StatusText.Text = live
            ? $"Streaming to {sessions.Count} phone{(sessions.Count == 1 ? "" : "s")}"
            : paired > 0 ? $"Ready · {paired} paired phone{(paired == 1 ? "" : "s")}" : "Ready to pair";
        RateText.Text = live ? $"sampling {_sampler.MeasuredHz:0} Hz" : "";
    }

    private Control PhoneRow(ClientSession s)
    {
        var row = new Grid { Margin = new Thickness(0, 4), ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        var left = new StackPanel();
        left.Children.Add(new TextBlock { Text = $"📱  {s.DisplayName}", FontWeight = FontWeight.SemiBold });
        string stats = s.Paused ? "paused (phone screen off)" :
            $"{Fmt(s.PhoneRttMs, "ms round-trip")} · {Fmt(s.PhoneLatencyMs, "ms cursor delay")} · {Fmt(s.PhoneFps, "fps")} · {s.CursorMessagesSent:N0} updates";
        left.Children.Add(new TextBlock { Text = stats, FontSize = 12, Foreground = (IBrush)this.FindResource("Muted")! });
        row.Children.Add(left);
        if (s.Device is { } device)
        {
            var forget = new Button { Content = "Forget", Classes = { "pill", "small" }, VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center };
            forget.Click += (_, _) => { _pairing.Forget(device.Id); _server.RevokeDevice(device.Id); AddLog($"Forgot {device.Name}"); };
            Grid.SetColumn(forget, 1);
            row.Children.Add(forget);
        }
        return row;
    }

    private static string Fmt(double? v, string unit) => v is null ? $"– {unit}" : $"{v:0} {unit}";

    private void BuildShareToggles()
    {
        var entries = new List<(string Key, string Label, string Description, bool Available)>
        {
            ("cursor", "Cursor position", "Where your pointer is, as a fraction of the screen. This is what the eyes follow.", true),
            ("clicks", "Mouse clicks", "That a mouse button was pressed (not where or in what app).", true),
            ("battery", "Battery", "Battery level and charging. Desktop Macs honestly report \"no battery\".", true),
            ("activity", "Away from Mac", "How long since you last touched the keyboard or mouse, so the pet can nap with you.", true),
            ("load", "CPU & memory load", "Overall system load percentages. Coming to the Mac later.", false),
        };
        foreach (var (key, label, description, available) in entries)
        {
            var row = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto"), Margin = new Thickness(0, 4) };
            var text = new StackPanel { VerticalAlignment = Avalonia.Layout.VerticalAlignment.Center };
            text.Children.Add(new TextBlock { Text = label, FontWeight = FontWeight.SemiBold });
            text.Children.Add(new TextBlock { Text = description, FontSize = 12, TextWrapping = TextWrapping.Wrap, Foreground = (IBrush)this.FindResource("Muted")! });
            var toggle = new ToggleSwitch { IsChecked = available && _settings.IsShared(key), IsEnabled = available, OnContent = null, OffContent = null, Margin = new Thickness(12, 0, 0, 0) };
            toggle.IsCheckedChanged += (_, _) => Toggle(key, toggle.IsChecked == true);
            Grid.SetColumn(toggle, 1);
            row.Children.Add(text);
            row.Children.Add(toggle);
            ShareToggles.Children.Add(row);
        }
    }

    private void Toggle(string key, bool on)
    {
        _settings.SetShared(key, on);
        _server.SharingChanged();
        AddLog($"{(on ? "Sharing" : "Stopped sharing")} {key}");
    }

    /// <summary>The mini Mochi looks at the pointer. Cursor and window are both in global points.</summary>
    private void FollowCursor()
    {
        if (!MiniPet.IsEffectivelyVisible || !_eyes.TryGetCursor(out int cx, out int cy)) return;
        var center = MiniPet.PointToScreen(new Point(32, 26)).ToPoint(1);
        double dx = cx - center.X, dy = cy - center.Y;
        double len = Math.Max(1, Math.Sqrt(dx * dx + dy * dy));
        double reach = Math.Min(1, len / EyeReachDistance) * EyeReachPx;
        double ox = dx / len * reach, oy = dy / len * reach;
        Canvas.SetLeft(PupilL, _pupilL.X + ox); Canvas.SetTop(PupilL, _pupilL.Y + oy);
        Canvas.SetLeft(PupilR, _pupilR.X + ox); Canvas.SetTop(PupilR, _pupilR.Y + oy);
    }

    private static Bitmap RenderQr(string text)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        var png = new PngByteQRCode(data).GetGraphic(12, [0x3B, 0x2A, 0x26, 0xFF], [0xFF, 0xFF, 0xFF, 0xFF], drawQuietZones: false);
        return new Bitmap(new MemoryStream(png));
    }

    private void AddLog(string line)
    {
        _log.Enqueue($"{DateTime.Now:HH:mm:ss}  {line}");
        while (_log.Count > MaxLogLines) _log.Dequeue();
        LogText.Text = string.Join("\n", _log.Reverse());
    }

    private static string Describe(string petEvent) => petEvent switch
    {
        "boop" => "your pet got booped",
        "pet" => "your pet is being petted",
        "play" => "playtime!",
        "dance" => "dance party",
        "cheer" => "cheering",
        "sleep" => "your pet dozed off",
        "wake" => "your pet woke up",
        "snack" => "snack time!",
        "outfit" => "your pet tried on a new outfit",
        "photo" => "your pet posed for a photo",
        "shake" => "the phone got shaken: dizzy pet",
        _ => petEvent,
    };

    private void NewCode_Click(object? sender, RoutedEventArgs e) { _pairing.NewCode(); AddLog("New pairing code made"); }

    private async void CopyLink_Click(object? sender, RoutedEventArgs e)
    {
        if (_baseUrl.Length == 0 || Clipboard is not { } clipboard) return;
        await clipboard.SetTextAsync($"{_baseUrl}#pair={_pairing.Code}");
        AddLog("Pairing link copied");
    }

    private void OpenHere_Click(object? sender, RoutedEventArgs e) => OpenInBrowser($"http://localhost:{_server.Port}/#pair={_pairing.Code}");

    private void OpenInBrowser(string url)
    {
        try
        {
            var psi = new ProcessStartInfo("/usr/bin/open") { UseShellExecute = false };
            psi.ArgumentList.Add(url);
            Process.Start(psi)?.Dispose();
        }
        catch (System.ComponentModel.Win32Exception ex) { AddLog($"Couldn't open the browser: {ex.Message}"); }
    }

    private void Say_Click(object? sender, RoutedEventArgs e) => SendSay();

    private void SayBox_KeyDown(object? sender, KeyEventArgs e) { if (e.Key == Key.Enter) SendSay(); }

    private void SendSay()
    {
        if (string.IsNullOrWhiteSpace(SayBox.Text)) return;
        _server.Say(SayBox.Text);
        AddLog($"Said: {SayBox.Text.Trim()}");
        SayBox.Text = "";
    }

    /// <summary>--snapshot path.png: render the window once it has settled, save it, quit (docs + CI).</summary>
    public void SnapshotAndExit(string path)
    {
        Opened += async (_, _) =>
        {
            await Task.Delay(SnapshotDelay);
            // 1:1 logical pixels: rendering a window at its Retina scale doubles nested content.
            var size = new PixelSize((int)Bounds.Width, (int)Bounds.Height);
            using (var bitmap = new RenderTargetBitmap(size))
            {
                bitmap.Render(this);
                bitmap.Save(path);
            }
            Close();
        };
    }
}
