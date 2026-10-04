using System.Diagnostics;
using System.Windows;
using PeekPets.Companion.Facts;
using PeekPets.Companion.Powers;
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

        bool loopback = args.ContainsKey("loopback");
        // Test switches only count in a loopback dry run, so they can never weaken a real,
        // LAN-facing companion. A fixed pairing code on the LAN additionally needs PEEKPETS_TEST=1.
        bool testMode = loopback && args.ContainsKey("dry-run-actions");
        bool lanTest = Environment.GetEnvironmentVariable("PEEKPETS_TEST") == "1";
        string? fixedCode = loopback || lanTest ? args.GetValueOrDefault("pair-code") : null;

        var clock = Stopwatch.StartNew();
        var pairing = new Pairing(settings, fixedCode: fixedCode);
        var sampler = new CursorSampler(clock);
        var facts = new FactHub(settings.IsShared);
        LocalCertificates? certs = args.ContainsKey("no-https") ? null : new LocalCertificates(args.GetValueOrDefault("cert-dir"));

        // Test switches: --dry-run-actions records instead of acting; --auto-approve skips the
        // first-use prompt; --test-hooks exposes /api/test/* (loopback only).
        ISystemActions actions = testMode ? new DryRunActions() : new WindowsActions(Dispatcher);
        var dataDir = Path.GetDirectoryName(settings.FilePath) ?? AppContext.BaseDirectory;
        var approvals = new DeferredApproval();
        var inbox = testMode && args.TryGetValue("inbox", out var inboxDir) ? new InboxStore(inboxDir) : null; // tests keep photos out of the real inbox
        var powers = new PowerHost(settings, PowerCatalog.Create(settings, inbox: inbox), actions, new OverridableIdle(new Win32Idle()),
            testMode && args.ContainsKey("auto-approve") ? new AutoApprove() : approvals, new AuditLog(Path.Combine(dataDir, "audit.log")));
        _server = new PetServer(settings, pairing, sampler, facts, clock, certs)
        {
            LoopbackOnly = loopback, Powers = powers, TestHooks = testMode && args.ContainsKey("test-hooks"),
        };

        var window = new MainWindow(_server, pairing, settings, sampler, powers);
        approvals.Inner = new Ui.ApprovalPrompt(window);
        MainWindow = window;
        if (args.ContainsKey("minimized")) window.WindowState = WindowState.Minimized;
        if (args.TryGetValue("tab", out var tab)) window.SelectTab(tab); // e.g. --tab powers (docs screenshots)
        if (args.TryGetValue("snapshot", out var snapshotPath)) window.SnapshotAndExit(snapshotPath); // docs screenshots
        window.Show();
        if (args.ContainsKey("preview-spotlight")) new Ui.CursorSpotlight().Show(); // see the find-cursor effect without a phone

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
        // Run off the UI thread: blocking the dispatcher on async work that captured it deadlocks.
        if (_server is { } server) Task.Run(() => server.DisposeAsync().AsTask()).Wait(TimeSpan.FromSeconds(2));
        base.OnExit(e);
    }

    /// <summary>The approval dialog needs the main window, which needs the host: break the cycle.</summary>
    private sealed class DeferredApproval : IApprovalPrompt
    {
        public IApprovalPrompt? Inner { get; set; }
        public Task<bool> AskAsync(string d, string p, string c) => Inner?.AskAsync(d, p, c) ?? Task.FromResult(false);
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
