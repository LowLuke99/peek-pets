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

/// <summary>
/// "Where's my cursor?": a spotlight that rides along with the mouse pointer for a few
/// seconds. Rings sweep inward onto the pointer, a soft glow pulses, a dashed orbit with
/// sparkles spins, and a tiny Mochi pops up next to it. Click-through; follows the
/// cursor every frame (physical pixels, any monitor/DPI).
/// </summary>
public sealed class CursorSpotlight : Window
{
    private const double Size = 440;
    private const double Center = Size / 2;
    private static readonly TimeSpan Lifetime = TimeSpan.FromMilliseconds(3600);
    private IntPtr _hwnd;
    private (int X, int Y) _last = (int.MinValue, int.MinValue);

    public CursorSpotlight()
    {
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ShowInTaskbar = false;
        Topmost = true;
        ShowActivated = false;
        Width = Height = Size;
        IsHitTestVisible = false;
        var canvas = new Canvas { Width = Size, Height = Size };
        Content = canvas;

        AddGlow(canvas);
        for (int i = 0; i < 3; i++) AddInwardRing(canvas, i);
        AddOrbit(canvas);
        AddPeekingMochi(canvas);

        // Whole effect: pop in, hold, then fade out.
        Opacity = 0;
        var life = new DoubleAnimationUsingKeyFrames();
        life.KeyFrames.Add(new EasingDoubleKeyFrame(1, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(160))));
        life.KeyFrames.Add(new LinearDoubleKeyFrame(1, KeyTime.FromTimeSpan(Lifetime - TimeSpan.FromMilliseconds(500))));
        life.KeyFrames.Add(new EasingDoubleKeyFrame(0, KeyTime.FromTimeSpan(Lifetime), new QuadraticEase()));
        life.Completed += (_, _) => Close();
        BeginAnimation(OpacityProperty, life);

        SourceInitialized += (_, _) =>
        {
            _hwnd = new WindowInteropHelper(this).Handle;
            SetWindowLong(_hwnd, -20, GetWindowLong(_hwnd, -20) | 0x20 | 0x80000 | 0x80); // click-through, layered, tool window
            Follow();
        };
        CompositionTarget.Rendering += OnRender;
        Closed += (_, _) => CompositionTarget.Rendering -= OnRender;
    }

    private void OnRender(object? sender, EventArgs e) => Follow();

    /// <summary>Keeps the spotlight centred on the pointer (only moves when the pointer did).</summary>
    private void Follow()
    {
        if (_hwnd == IntPtr.Zero || !Sensors.Win32.GetCursorPos(out var p) || (p.X, p.Y) == _last) return;
        _last = (p.X, p.Y);
        var dpi = VisualTreeHelper.GetDpi(this);
        int w = (int)(Size * dpi.DpiScaleX), h = (int)(Size * dpi.DpiScaleY);
        SetWindowPos(_hwnd, new IntPtr(-1), p.X - w / 2, p.Y - h / 2, w, h, 0x10 | 0x0400);
    }

    private static Color Coral => Color.FromRgb(0xF2, 0x73, 0x5F);

    private static void AddGlow(Canvas canvas)
    {
        var brush = new RadialGradientBrush();
        brush.GradientStops.Add(new GradientStop(Color.FromArgb(150, 0xFF, 0xD3, 0x6B), 0));
        brush.GradientStops.Add(new GradientStop(Color.FromArgb(90, 0xF2, 0x73, 0x5F), 0.35));
        brush.GradientStops.Add(new GradientStop(Color.FromArgb(0, 0xF2, 0x73, 0x5F), 1));
        var glow = new Ellipse { Width = 260, Height = 260, Fill = brush, RenderTransformOrigin = new Point(0.5, 0.5) };
        Place(glow, 260);
        var pulse = new ScaleTransform(1, 1);
        glow.RenderTransform = pulse;
        var beat = new DoubleAnimation(0.8, 1.12, TimeSpan.FromMilliseconds(420)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase() };
        pulse.BeginAnimation(ScaleTransform.ScaleXProperty, beat);
        pulse.BeginAnimation(ScaleTransform.ScaleYProperty, beat);
        canvas.Children.Add(glow);
    }

    /// <summary>Big rings that sweep in onto the pointer, like a camera finding focus.</summary>
    private static void AddInwardRing(Canvas canvas, int i)
    {
        var ring = new Ellipse { Width = Size - 20, Height = Size - 20, Stroke = new SolidColorBrush(Coral), StrokeThickness = 7, RenderTransformOrigin = new Point(0.5, 0.5), Opacity = 0 };
        Place(ring, Size - 20);
        var scale = new ScaleTransform(1, 1);
        ring.RenderTransform = scale;
        var begin = TimeSpan.FromMilliseconds(i * 230);
        var shrink = new DoubleAnimation(1, 0.12, TimeSpan.FromMilliseconds(760)) { BeginTime = begin, EasingFunction = new CubicEase { EasingMode = EasingMode.EaseIn }, RepeatBehavior = new RepeatBehavior(3) };
        var fade = new DoubleAnimationUsingKeyFrames { BeginTime = begin, RepeatBehavior = new RepeatBehavior(3) };
        fade.KeyFrames.Add(new LinearDoubleKeyFrame(0.9, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(120))));
        fade.KeyFrames.Add(new LinearDoubleKeyFrame(0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(760))));
        scale.BeginAnimation(ScaleTransform.ScaleXProperty, shrink);
        scale.BeginAnimation(ScaleTransform.ScaleYProperty, shrink);
        ring.BeginAnimation(OpacityProperty, fade);
        canvas.Children.Add(ring);
    }

    /// <summary>A spinning dashed ring with four sparkles riding on it.</summary>
    private static void AddOrbit(Canvas canvas)
    {
        const double d = 120;
        var orbit = new Canvas { Width = d, Height = d, RenderTransformOrigin = new Point(0.5, 0.5) };
        orbit.Children.Add(new Ellipse { Width = d, Height = d, Stroke = Brushes.White, StrokeThickness = 4, StrokeDashArray = [2.5, 2.5], StrokeDashCap = PenLineCap.Round, Opacity = 0.95 });
        for (int k = 0; k < 4; k++)
        {
            var a = k * Math.PI / 2;
            var star = Sparkle(18);
            Canvas.SetLeft(star, d / 2 + Math.Cos(a) * d / 2 - 9);
            Canvas.SetTop(star, d / 2 + Math.Sin(a) * d / 2 - 9);
            orbit.Children.Add(star);
        }
        Place(orbit, d);
        var spin = new RotateTransform();
        orbit.RenderTransform = spin;
        spin.BeginAnimation(RotateTransform.AngleProperty, new DoubleAnimation(0, 360, TimeSpan.FromMilliseconds(1600)) { RepeatBehavior = RepeatBehavior.Forever });
        orbit.Effect = new System.Windows.Media.Effects.DropShadowEffect { Color = Coral, BlurRadius = 12, ShadowDepth = 0, Opacity = 0.9 };
        canvas.Children.Add(orbit);
    }

    private static UIElement Sparkle(double s) => new System.Windows.Shapes.Path
    {
        Width = s, Height = s, Stretch = Stretch.Fill, Fill = new SolidColorBrush(Color.FromRgb(0xFF, 0xD3, 0x6B)),
        Data = Geometry.Parse("M5,0 C5.6,3.4 6.6,4.4 10,5 C6.6,5.6 5.6,6.6 5,10 C4.4,6.6 3.4,5.6 0,5 C3.4,4.4 4.4,3.4 5,0 Z"),
    };

    /// <summary>A tiny Mochi pops up beside the pointer with a "here!" bubble.</summary>
    private static void AddPeekingMochi(Canvas canvas)
    {
        var stack = new StackPanel { RenderTransformOrigin = new Point(0.5, 1) };
        stack.Children.Add(new Border
        {
            Background = Brushes.White, CornerRadius = new CornerRadius(10), Padding = new Thickness(8, 2, 8, 3),
            HorizontalAlignment = HorizontalAlignment.Center, Margin = new Thickness(0, 0, 0, 3),
            Child = new TextBlock { Text = "here!", FontWeight = FontWeights.Black, FontSize = 15, Foreground = Palette.Ink },
            Effect = new System.Windows.Media.Effects.DropShadowEffect { BlurRadius = 8, ShadowDepth = 1, Opacity = 0.25 },
        });
        stack.Children.Add(Palette.Mochi(56));
        Canvas.SetLeft(stack, Center + 34);
        Canvas.SetTop(stack, Center - 118);
        var pop = new ScaleTransform(0, 0);
        var bob = new TranslateTransform();
        stack.RenderTransform = new TransformGroup { Children = { pop, bob } };
        var grow = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(420)) { BeginTime = TimeSpan.FromMilliseconds(250), EasingFunction = new BackEase { Amplitude = 0.6 } };
        pop.BeginAnimation(ScaleTransform.ScaleXProperty, grow);
        pop.BeginAnimation(ScaleTransform.ScaleYProperty, grow);
        bob.BeginAnimation(TranslateTransform.YProperty, new DoubleAnimation(0, -6, TimeSpan.FromMilliseconds(380)) { AutoReverse = true, RepeatBehavior = RepeatBehavior.Forever, EasingFunction = new SineEase() });
        canvas.Children.Add(stack);
    }

    private static void Place(FrameworkElement e, double size)
    {
        Canvas.SetLeft(e, Center - size / 2);
        Canvas.SetTop(e, Center - size / 2);
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
