using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using PeekPets.Companion.Powers;

namespace PeekPets.Companion.Ui;

internal static class Palette
{
    public static readonly Brush Paper = Frozen("#FFF6F0");
    public static readonly Brush Ink = Frozen("#3B2A26");
    public static readonly Brush Muted = Frozen("#7C645C");
    public static readonly Brush Coral = Frozen("#F2735F");
    public static readonly Brush Line = Frozen("#F0DED6");

    private static Brush Frozen(string hex)
    {
        var b = (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;
        b.Freeze();
        return b;
    }

    /// <summary>A tiny Mochi face, the same one the companion window uses.</summary>
    public static UIElement Mochi(double size)
    {
        var canvas = new Canvas { Width = 64, Height = 56 };
        canvas.Children.Add(new System.Windows.Shapes.Path { Fill = Coral, Data = Geometry.Parse("M32,2 C50,2 60,18 62,34 C64,48 54,52 32,52 C10,52 0,48 2,34 C4,18 14,2 32,2 Z") });
        canvas.Children.Add(new System.Windows.Shapes.Path { Fill = Frozen("#FFE9DD"), Data = Geometry.Parse("M32,13 C46,13 54,19 54,27 C54,36 45,40 32,40 C19,40 10,36 10,27 C10,19 18,13 32,13 Z") });
        foreach (var x in new[] { 17.0, 37.0 })
        {
            var eye = new Ellipse { Width = 10, Height = 10, Fill = Frozen("#3A231E") };
            Canvas.SetLeft(eye, x); Canvas.SetTop(eye, 21);
            canvas.Children.Add(eye);
        }
        return new Viewbox { Width = size, Height = size * 56 / 64, Child = canvas };
    }
}

/// <summary>A small card in the bottom-right corner: "Photo from iPhone · click to show it".</summary>
public sealed class ToastWindow : Window
{
    private static readonly List<ToastWindow> Open = [];

    private ToastWindow(string title, string body, string? openPath)
    {
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ShowInTaskbar = false;
        Topmost = true;
        ShowActivated = false;
        SizeToContent = SizeToContent.WidthAndHeight;
        ResizeMode = ResizeMode.NoResize;

        var text = new StackPanel { Margin = new Thickness(12, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, MaxWidth = 280 };
        text.Children.Add(new TextBlock { Text = title, FontWeight = FontWeights.Bold, FontSize = 14, Foreground = Palette.Ink, TextTrimming = TextTrimming.CharacterEllipsis });
        text.Children.Add(new TextBlock { Text = body, FontSize = 12.5, Foreground = Palette.Muted, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 2, 0, 0) });
        var row = new StackPanel { Orientation = Orientation.Horizontal };
        row.Children.Add(Palette.Mochi(38));
        row.Children.Add(text);
        Content = new Border
        {
            Background = Palette.Paper, CornerRadius = new CornerRadius(18), Padding = new Thickness(14, 12, 18, 12),
            BorderBrush = Palette.Line, BorderThickness = new Thickness(1), Margin = new Thickness(14),
            Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 18, ShadowDepth = 3, Opacity = 0.18 },
            Child = row, Cursor = openPath is null ? Cursors.Arrow : Cursors.Hand,
        };
        MouseLeftButtonUp += (_, _) =>
        {
            if (openPath is not null)
            {
                // Show the file in its folder; if it's gone, open the folder (never run the file).
                var folder = System.IO.Path.GetDirectoryName(openPath);
                var args = File.Exists(openPath) ? $"/select,\"{openPath}\"" : folder is not null && Directory.Exists(folder) ? $"\"{folder}\"" : null;
                var explorer = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "explorer.exe");
                if (args is not null)
                {
                    try { Process.Start(new ProcessStartInfo(explorer, args) { UseShellExecute = true })?.Dispose(); } catch (Exception) { }
                }
            }
            Close();
        };
        Closed += (_, _) => { Open.Remove(this); Restack(); };
    }

    public static void Show(string title, string body, string? openPath)
    {
        while (Open.Count >= 4) Open[0].Close(); // never a wall of toasts
        var toast = new ToastWindow(title, body, openPath) { Opacity = 0 };
        Open.Add(toast);
        toast.Show();
        Restack();
        toast.BeginAnimation(OpacityProperty, new DoubleAnimation(1, TimeSpan.FromMilliseconds(220)));
        var timer = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(6) };
        timer.Tick += (_, _) => { timer.Stop(); toast.Close(); };
        timer.Start();
    }

    private static void Restack()
    {
        var area = SystemParameters.WorkArea;
        double bottom = area.Bottom;
        foreach (var t in Open.AsEnumerable().Reverse())
        {
            t.UpdateLayout();
            t.Left = area.Right - t.ActualWidth;
            t.Top = bottom - t.ActualHeight;
            bottom = t.Top + 6;
        }
    }
}

/// <summary>Expanding rings around the mouse pointer so you can spot it ("where's my cursor?").</summary>
public sealed class CursorRing : Window
{
    private const double Size = 360;

    public CursorRing()
    {
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ShowInTaskbar = false;
        Topmost = true;
        ShowActivated = false;
        Width = Height = Size;
        IsHitTestVisible = false;
        var canvas = new Canvas();
        Content = canvas;
        for (int i = 0; i < 3; i++)
        {
            var ring = new Ellipse { Width = Size, Height = Size, Stroke = Palette.Coral, StrokeThickness = 10, RenderTransformOrigin = new Point(0.5, 0.5), Opacity = 0 };
            var scale = new ScaleTransform(0.05, 0.05);
            ring.RenderTransform = scale;
            canvas.Children.Add(ring);
            var begin = TimeSpan.FromMilliseconds(i * 260);
            var grow = new DoubleAnimation(0.05, 1, TimeSpan.FromMilliseconds(900)) { BeginTime = begin, EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }, RepeatBehavior = new RepeatBehavior(2) };
            var fade = new DoubleAnimationUsingKeyFrames { BeginTime = begin, RepeatBehavior = new RepeatBehavior(2) };
            fade.KeyFrames.Add(new LinearDoubleKeyFrame(0.95, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(80))));
            fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(900))));
            scale.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
            scale.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
            ring.BeginAnimation(OpacityProperty, fade);
        }
        SourceInitialized += (_, _) =>
        {
            // Click-through, and centred on the cursor in physical pixels (any DPI).
            var hwnd = new WindowInteropHelper(this).Handle;
            SetWindowLong(hwnd, -20, GetWindowLong(hwnd, -20) | 0x20 | 0x80000 | 0x80);
            Sensors.Win32.GetCursorPos(out var p);
            var dpi = VisualTreeHelper.GetDpi(this);
            int px = (int)(Size * dpi.DpiScaleX), py = (int)(Size * dpi.DpiScaleY);
            SetWindowPos(hwnd, new IntPtr(-1), p.X - px / 2, p.Y - py / 2, px, py, 0x10);
        };
        var close = new System.Windows.Threading.DispatcherTimer { Interval = TimeSpan.FromMilliseconds(2400) };
        close.Tick += (_, _) => { close.Stop(); Close(); };
        close.Start();
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hwnd, int index);
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern int SetWindowLong(IntPtr hwnd, int index, int value);
    [System.Runtime.InteropServices.DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int w, int h, uint flags);
}

/// <summary>"Your iPhone wants to: Lock this PC" with Allow / Don't allow. Shown once per phone and command.</summary>
public sealed class ApprovalPrompt(Window owner) : IApprovalPrompt
{
    private readonly SemaphoreSlim _oneAtATime = new(1, 1);

    /// <summary>Dialogs queue up: only one is ever on screen.</summary>
    public async Task<bool> AskAsync(string deviceName, string powerLabel, string commandLabel)
    {
        if (!await _oneAtATime.WaitAsync(PowerHost.ApprovalTimeout)) return false;
        try { return await ShowAsync(deviceName, powerLabel, commandLabel); }
        finally { _oneAtATime.Release(); }
    }

    private Task<bool> ShowAsync(string deviceName, string powerLabel, string commandLabel)
    {
        var tcs = new TaskCompletionSource<bool>();
        owner.Dispatcher.BeginInvoke(() =>
        {
            var dialog = new ApprovalWindow(deviceName, powerLabel, commandLabel);
            if (owner.IsVisible) dialog.Owner = owner;
            dialog.Closed += (_, _) => tcs.TrySetResult(dialog.Allowed);
            dialog.Show();
            dialog.Activate();
            // Closes itself if nobody answers, so a phone never waits forever.
            var timer = new System.Windows.Threading.DispatcherTimer { Interval = PowerHost.ApprovalTimeout - TimeSpan.FromSeconds(2) };
            timer.Tick += (_, _) => { timer.Stop(); if (dialog.IsVisible) dialog.Close(); };
            timer.Start();
        });
        return tcs.Task;
    }
}

internal sealed class ApprovalWindow : Window
{
    public bool Allowed { get; private set; }

    public ApprovalWindow(string device, string power, string command)
    {
        Title = "Peek Pets: allow this?";
        SizeToContent = SizeToContent.Height;
        Width = 420;
        ResizeMode = ResizeMode.NoResize;
        Topmost = true;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = Palette.Paper;
        FontFamily = new FontFamily("Segoe UI Variable Text, Segoe UI");

        var panel = new StackPanel { Margin = new Thickness(22) };
        var head = new StackPanel { Orientation = Orientation.Horizontal, Margin = new Thickness(0, 0, 0, 12) };
        head.Children.Add(Palette.Mochi(44));
        head.Children.Add(new TextBlock { Text = $"{device} wants to:", FontSize = 15, Foreground = Palette.Muted, VerticalAlignment = VerticalAlignment.Center, Margin = new Thickness(12, 0, 0, 0) });
        panel.Children.Add(head);
        panel.Children.Add(new TextBlock { Text = command, FontSize = 22, FontWeight = FontWeights.Bold, Foreground = Palette.Ink, TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock
        {
            Text = $"Power: {power}. If you allow it, this phone can do this again without asking. You can reset approvals in the companion's Powers tab.",
            FontSize = 12.5, Foreground = Palette.Muted, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 18),
        });
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var deny = new Button { Content = "Don't allow", Padding = new Thickness(16, 7, 16, 7), Margin = new Thickness(0, 0, 10, 0), IsCancel = true };
        var allow = new Button { Content = "Allow", Padding = new Thickness(22, 7, 22, 7), IsDefault = false, FontWeight = FontWeights.SemiBold };
        deny.Click += (_, _) => Close();
        allow.Click += (_, _) => { Allowed = true; Close(); };
        buttons.Children.Add(deny);
        buttons.Children.Add(allow);
        panel.Children.Add(buttons);
        Content = panel;
        Loaded += (_, _) => deny.Focus(); // Enter never approves by accident
    }
}
