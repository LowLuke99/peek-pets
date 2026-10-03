using System.Diagnostics;
using System.Windows;
using PeekPets.Companion.Facts;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;

namespace PeekPets.Companion;

public partial class App : Application
{
    private PetServer? _server;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var args = ParseArgs(e.Args);

        var settings = CompanionSettings.Load(args.GetValueOrDefault("settings"));
        if (args.TryGetValue("port", out var portText) && int.TryParse(portText, out var port)) settings.Port = port;

        var clock = Stopwatch.StartNew();
        var pairing = new Pairing(settings, fixedCode: args.GetValueOrDefault("pair-code"));
        var sampler = new CursorSampler(clock);
        var facts = new FactHub(settings.IsShared);
        _server = new PetServer(settings, pairing, sampler, facts, clock);

        var window = new MainWindow(_server, pairing, settings, sampler);
        MainWindow = window;
        if (args.ContainsKey("minimized")) window.WindowState = WindowState.Minimized;
        window.Show();

        try
        {
            await _server.StartAsync();
            window.OnServerStarted();
        }
        catch (Exception ex)
        {
            MessageBox.Show(window,
                $"Peek Pets couldn't start its local server on port {settings.Port}.\n\n{ex.Message}\n\nIs another copy already running?",
                "Peek Pets Companion", MessageBoxButton.OK, MessageBoxImage.Warning);
            Shutdown(1);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        // Tell phones we're leaving so they show "PC closed" instantly instead of timing out.
        _server?.DisposeAsync().AsTask().Wait(TimeSpan.FromSeconds(2));
        base.OnExit(e);
    }

    private static Dictionary<string, string> ParseArgs(string[] args)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < args.Length; i++)
        {
            if (!args[i].StartsWith("--")) continue;
            var key = args[i][2..];
            map[key] = i + 1 < args.Length && !args[i + 1].StartsWith("--") ? args[++i] : "true";
        }
        return map;
    }
}
