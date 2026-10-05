using System.Diagnostics;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using PeekPets.Companion.Facts;
using PeekPets.Companion.Platform;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;

namespace PeekPets.Companion.Mac;

public sealed class App : Application
{
    private static readonly TimeSpan ByeTimeout = TimeSpan.FromSeconds(2);
    private PetServer? _server;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var args = CompanionArgs.Parse(desktop.Args ?? []);
            var settings = CompanionSettings.Load(args.GetValueOrDefault("settings"));
            if (args.TryGetValue("port", out var portText) && int.TryParse(portText, out var port)) settings.Port = port;

            // Same rules as Windows: a fixed pairing code only in a loopback run, or on the
            // LAN with PEEKPETS_TEST=1, so test switches can never weaken a real companion.
            bool loopback = args.ContainsKey("loopback");
            bool lanTest = Environment.GetEnvironmentVariable("PEEKPETS_TEST") == "1";
            string? fixedCode = loopback || lanTest ? args.GetValueOrDefault("pair-code") : null;

            var clock = Stopwatch.StartNew();
            var pairing = new Pairing(settings, fixedCode: fixedCode);
            var sampler = new CursorSampler(clock, PlatformServices.CreateCursorSource());
            var facts = new FactHub(settings.IsShared, PlatformServices.CreateFacts());
            LocalCertificates? certs = args.ContainsKey("no-https") ? null : new LocalCertificates(args.GetValueOrDefault("cert-dir"));
            // Powers (break buddy, media keys, …) come to the Mac in Phase 2.
            _server = new PetServer(settings, pairing, sampler, facts, clock, certs) { LoopbackOnly = loopback };

            var window = new MainWindow(_server, pairing, settings, sampler);
            desktop.MainWindow = window;
            desktop.ShutdownMode = ShutdownMode.OnMainWindowClose;
            desktop.Exit += (_, _) => SayGoodbye();
            if (args.TryGetValue("snapshot", out var snapshotPath)) window.SnapshotAndExit(snapshotPath); // docs + CI screenshots
            _ = StartServerAsync(window, settings.Port);
        }
        base.OnFrameworkInitializationCompleted();
    }

    private async Task StartServerAsync(MainWindow window, int port)
    {
        try
        {
            await _server!.StartAsync();
            window.OnServerStarted();
        }
        catch (Exception ex)
        {
            window.OnServerFailed($"Couldn't start on port {port}: {ex.Message} Is another copy already running?");
        }
    }

    /// <summary>Tell phones we're leaving so they show "PC closed" instantly instead of timing out.</summary>
    private void SayGoodbye()
    {
        // Off the UI thread: blocking the dispatcher on async work that captured it deadlocks.
        if (_server is { } server) Task.Run(() => server.DisposeAsync().AsTask()).Wait(ByeTimeout);
    }
}
