using System.Runtime.Versioning;
using Avalonia;

// This app is the macOS shell; Windows has its own WPF app in companion/.
[assembly: SupportedOSPlatform("macos")]

namespace PeekPets.Companion.Mac;

internal static class Program
{
    [STAThread]
    public static void Main(string[] args) => BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);

    // Also used by the Avalonia designer.
    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            .With(new MacOSPlatformOptions { ShowInDock = true })
            .LogToTrace();
}
