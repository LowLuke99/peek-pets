using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using PeekPets.Companion.Powers;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;
using QRCoder;

namespace PeekPets.Companion;

public partial class MainWindow : Window
{
    private const int MaxLogLines = 9;
    private readonly PetServer _server;
    private readonly Pairing _pairing;
    private readonly CompanionSettings _settings;
    private readonly CursorSampler _sampler;
    private readonly Queue<string> _log = new();
    private readonly DispatcherTimer _slowTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private readonly DispatcherTimer _eyeTimer = new() { Interval = TimeSpan.FromMilliseconds(33) };
    private string _baseUrl = "";
    private Point _pupilL, _pupilR;

    public MainWindow(PetServer server, Pairing pairing, CompanionSettings settings, CursorSampler sampler, PowerHost powers)
    {
        InitializeComponent();
        _powers = powers;
        _server = server;
        _pairing = pairing;
        _settings = settings;
        _sampler = sampler;
        _pupilL = new Point(Canvas.GetLeft(PupilL), Canvas.GetTop(PupilL));
        _pupilR = new Point(Canvas.GetLeft(PupilR), Canvas.GetTop(PupilR));

        _server.SessionsChanged += () => Dispatcher.BeginInvoke(RefreshPhones);
        _server.Log += line => Dispatcher.BeginInvoke(() => AddLog(line));
        _server.PetEvent += (phone, name) => Dispatcher.BeginInvoke(() => AddLog($"{phone}: {Describe(name)}"));
        _pairing.CodeChanged += () => Dispatcher.BeginInvoke(RefreshPairing);
        _pairing.DevicesChanged += () => Dispatcher.BeginInvoke(RefreshPhones);

        BuildShareToggles();
        InitPowers();
        _slowTimer.Tick += (_, _) => OnSlowTick();
        _eyeTimer.Tick += (_, _) => FollowCursor();
        _eyeTimer.Start();
        StateChanged += (_, _) => { if (WindowState == WindowState.Minimized) _eyeTimer.Stop(); else _eyeTimer.Start(); };
    }

    public void OnServerStarted()
    {
        var lan = NetworkInfo.LanAddresses();
        var ip = lan.FirstOrDefault()?.Address.ToString() ?? "localhost";
        _baseUrl = $"http://{ip}:{_server.Port}/";
        UrlBox.Text = _baseUrl.TrimEnd('/');
        NetworkText.Text = lan.Count == 0
            ? "No Wi-Fi/Ethernet address found. Connect this PC to the same Wi-Fi as your phone."
            : string.Join("\n", lan.Select(a => $"{a.Address}  ·  {a.Interface}")) + $"\nPort {_server.Port}"
              + (_server.MdnsStatus is { } mdns ? $"\niPhone app: {mdns}" : "");
        RefreshPairing();
        RefreshPhones();
        _slowTimer.Start();
        AddLog("Companion ready. Waiting for your phone.");
        _ = CheckFirewallAsync();
    }

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
        else InstallCard.Visibility = Visibility.Collapsed;
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
        NoPhonesText.Visibility = sessions.Count == 0 ? Visibility.Visible : Visibility.Collapsed;
        PhoneList.Items.Clear();
        foreach (var s in sessions) PhoneList.Items.Add(PhoneRow(s));

        int paired = _pairing.Devices.Count;
        bool live = sessions.Count > 0;
        StatusDot.Fill = (Brush)FindResource(live ? "Good" : "Warn");
        StatusText.Text = live
            ? $"Streaming to {sessions.Count} phone{(sessions.Count == 1 ? "" : "s")}"
            : paired > 0 ? $"Ready · {paired} paired phone{(paired == 1 ? "" : "s")}" : "Ready to pair";
        RateText.Text = live ? $"sampling {_sampler.MeasuredHz:0} Hz" : "";
    }

    private UIElement PhoneRow(ClientSession s)
    {
        var row = new Grid { Margin = new Thickness(0, 4, 0, 4) };
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var left = new StackPanel();
        left.Children.Add(new TextBlock { Text = $"📱  {s.DisplayName}", FontWeight = FontWeights.SemiBold });
        string stats = s.Paused ? "paused (phone screen off)" :
            $"{Fmt(s.PhoneRttMs, "ms round-trip")} · {Fmt(s.PhoneLatencyMs, "ms cursor delay")} · {Fmt(s.PhoneFps, "fps")} · {s.CursorMessagesSent:N0} updates";
        left.Children.Add(new TextBlock { Text = stats, FontSize = 12, Foreground = (Brush)FindResource("Muted") });
        row.Children.Add(left);
        if (s.Device is { } device)
        {
            var forget = new Button { Content = "Forget", Style = (Style)FindResource("PillButton"), Padding = new Thickness(10, 4, 10, 4), FontSize = 12 };
            forget.Click += (_, _) => { _pairing.Forget(device.Id); _server.RevokeDevice(device.Id); AddLog($"Forgot {device.Name}"); };
            Grid.SetColumn(forget, 1);
            row.Children.Add(forget);
        }
        return row;
    }

    private static string Fmt(double? v, string unit) => v is null ? $"– {unit}" : $"{v:0} {unit}";

    private void BuildShareToggles()
    {
        var entries = new List<(string Key, string Label, string Description, bool Locked)>
        {
            ("cursor", "Cursor position", "Where your pointer is, as a fraction of the screen. This is what the eyes follow.", false),
            ("clicks", "Mouse clicks", "That a mouse button was pressed (not where or in what app).", false),
            ("battery", "Battery", "Battery level and charging. Desktops honestly report \"no battery\".", false),
            ("activity", "Away from PC", "How long since you last touched the keyboard or mouse, so the pet can nap with you.", false),
            ("load", "CPU & memory load", "Overall system load percentages.", false),
        };
        foreach (var (key, label, description, _) in entries)
        {
            var box = new CheckBox { Style = (Style)FindResource("Toggle"), IsChecked = _settings.IsShared(key) };
            var text = new StackPanel();
            text.Children.Add(new TextBlock { Text = label, FontWeight = FontWeights.SemiBold });
            text.Children.Add(new TextBlock { Text = description, FontSize = 12, TextWrapping = TextWrapping.Wrap, Foreground = (Brush)FindResource("Muted") });
            box.Content = text;
            box.Checked += (_, _) => Toggle(key, true);
            box.Unchecked += (_, _) => Toggle(key, false);
            ShareToggles.Children.Add(box);
        }
    }

    private void Toggle(string key, bool on)
    {
        _settings.SetShared(key, on);
        _server.SharingChanged();
        AddLog($"{(on ? "Sharing" : "Stopped sharing")} {key}");
    }

    private async Task CheckFirewallAsync()
    {
        var exe = Environment.ProcessPath ?? "";
        var report = await NetworkInfo.CheckFirewallAsync(_server.Port, exe);
        NetworkText.Text += $"\nWi-Fi “{report.NetworkName}” is {report.Category}";
        if (report.Error is not null || !report.LikelyBlocked) return;
        FirewallDetail.Text = report.AppBlocked
            ? "Windows has a rule blocking Peek Pets. Click Fix to allow phones on your local network (Windows will ask for permission)."
            : $"Your Wi-Fi is set to {report.Category} and no rule lets phones reach port {_server.Port}. Click Fix to allow local-network phones only, or answer “Allow” if Windows pops up a firewall prompt.";
        FirewallBanner.Visibility = Visibility.Visible;
    }

    private void FixFirewall_Click(object sender, RoutedEventArgs e)
    {
        var script = FindTool("Allow-Phone-Access.ps1");
        if (script is null) { MessageBox.Show(this, "Couldn't find Allow-Phone-Access.ps1 next to the app.", "Peek Pets"); return; }
        try
        {
            var psi = new ProcessStartInfo("powershell.exe",
                $"-NoProfile -ExecutionPolicy Bypass -File \"{script}\" -Port {_server.Port} -Program \"{Environment.ProcessPath}\"")
            { UseShellExecute = true, Verb = "runas" };
            Process.Start(psi)?.WaitForExit();
            FirewallBanner.Visibility = Visibility.Collapsed;
            AddLog("Firewall helper finished. Try your phone again.");
            _ = CheckFirewallAsync();
        }
        catch (System.ComponentModel.Win32Exception)
        {
            AddLog("Firewall fix cancelled.");
        }
    }

    private static string? FindTool(string name)
    {
        // Only the copy shipped next to the exe: this script runs elevated, so never
        // pick one up from parent folders.
        var candidate = Path.Combine(AppContext.BaseDirectory, name);
        return File.Exists(candidate) ? candidate : null;
    }

    private void FollowCursor()
    {
        if (!Win32.GetCursorPos(out var p) || !MiniPet.IsVisible) return;
        var center = MiniPet.PointToScreen(new Point(32, 26));
        double dx = p.X - center.X, dy = p.Y - center.Y;
        double len = Math.Max(1, Math.Sqrt(dx * dx + dy * dy));
        double reach = Math.Min(1, len / 300) * 2.2;
        double ox = dx / len * reach, oy = dy / len * reach;
        Canvas.SetLeft(PupilL, _pupilL.X + ox); Canvas.SetTop(PupilL, _pupilL.Y + oy);
        Canvas.SetLeft(PupilR, _pupilR.X + ox); Canvas.SetTop(PupilR, _pupilR.Y + oy);
    }

    private static ImageSource RenderQr(string text)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(text, QRCodeGenerator.ECCLevel.M);
        var png = new PngByteQRCode(data).GetGraphic(12, [0x3B, 0x2A, 0x26, 0xFF], [0xFF, 0xFF, 0xFF, 0xFF], drawQuietZones: false);
        var image = new BitmapImage();
        image.BeginInit();
        image.StreamSource = new MemoryStream(png);
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.EndInit();
        image.Freeze();
        return image;
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

    private void NewCode_Click(object sender, RoutedEventArgs e) { _pairing.NewCode(); AddLog("New pairing code made"); }

    private void CopyLink_Click(object sender, RoutedEventArgs e)
    {
        if (_baseUrl.Length > 0) Clipboard.SetText($"{_baseUrl}#pair={_pairing.Code}");
    }

    private void OpenHere_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo($"http://localhost:{_server.Port}/#pair={_pairing.Code}") { UseShellExecute = true });
    }

    private void Say_Click(object sender, RoutedEventArgs e) => SendSay();

    private void SayBox_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) SendSay(); }

    private void SendSay()
    {
        if (string.IsNullOrWhiteSpace(SayBox.Text)) return;
        _server.Say(SayBox.Text);
        AddLog($"Said: {SayBox.Text.Trim()}");
        SayBox.Clear();
    }
}
