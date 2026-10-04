using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using PeekPets.Companion.Powers;

namespace PeekPets.Companion;

/// <summary>The Powers and Labs scorecard tabs of the companion window.</summary>
public partial class MainWindow
{
    private readonly PowerHost _powers;
    private readonly Dictionary<string, (CheckBox Box, TextBlock Status)> _powerRows = new();
    private DispatcherOperation? _pendingPowerRefresh;

    private void InitPowers()
    {
        foreach (var p in _powers.Powers)
        {
            var box = new CheckBox { Style = (Style)FindResource("Toggle"), IsChecked = _powers.IsAllowed(p.Key) };
            var text = new StackPanel();
            var title = new StackPanel { Orientation = Orientation.Horizontal };
            title.Children.Add(new TextBlock { Text = p.Label, FontWeight = FontWeights.SemiBold });
            var status = new TextBlock { FontSize = 11.5, Margin = new Thickness(8, 1, 0, 0), VerticalAlignment = VerticalAlignment.Center };
            title.Children.Add(status);
            text.Children.Add(title);
            text.Children.Add(new TextBlock { Text = p.Description, FontSize = 12, TextWrapping = TextWrapping.Wrap, Foreground = (Brush)FindResource("Muted") });
            box.Content = text;
            var key = p.Key;
            box.Checked += (_, _) => _powers.SetPcAllowed(key, true);
            box.Unchecked += (_, _) => _powers.SetPcAllowed(key, false);
            PowerToggles.Children.Add(box);
            _powerRows[key] = (box, status);
        }
        _powers.Changed += SchedulePowerRefresh;
        _powers.LogLine += line => Dispatcher.BeginInvoke(() => AddLog(line));
        _powers.Audit.Added += _ => SchedulePowerRefresh();
        RefreshPowers();
    }

    /// <summary>Counters change often; coalesce refreshes onto the UI thread.</summary>
    private void SchedulePowerRefresh()
    {
        if (_pendingPowerRefresh is { Status: DispatcherOperationStatus.Pending }) return;
        _pendingPowerRefresh = Dispatcher.BeginInvoke(RefreshPowers, DispatcherPriority.Background);
    }

    private void RefreshPowers()
    {
        foreach (var p in _powers.Powers)
        {
            var (box, status) = _powerRows[p.Key];
            bool allowed = _powers.IsAllowed(p.Key), on = _powers.IsPhoneOn(p.Key);
            if (box.IsChecked != allowed) box.IsChecked = allowed;
            (status.Text, status.Foreground) = (allowed, on) switch
            {
                (true, true) => ("● running", (Brush)FindResource("Good")),
                (true, false) => ("off on the phone", (Brush)FindResource("Muted")),
                (false, true) => ("phone wants it, blocked here", (Brush)FindResource("Warn")),
                _ => ("blocked", (Brush)FindResource("Muted")),
            };
        }
        RefreshFavorites();
        var approved = _powers.ApprovedCommands();
        ApprovedText.Text = approved.Count == 0 ? "None yet. Phones ask the first time they use a command." : string.Join("  ·  ", approved);
        RefreshScorecard();
        var audit = _powers.Audit.Entries.Take(30).ToList();
        AuditText.Text = audit.Count == 0 ? "No commands yet." : string.Join("\n", audit);
    }

    private void RefreshScorecard()
    {
        ScoreGrid.Children.Clear();
        ScoreGrid.RowDefinitions.Clear();
        ScoreGrid.ColumnDefinitions.Clear();
        foreach (var w in new[] { 2.2, 0.8, 0.8, 1.0, 1.2, 2.2 }) ScoreGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(w, GridUnitType.Star) });
        string[] headers = ["Power", "Fired", "Used", "Dismissed", "Last used", "Verdict"];
        AddRow(0, headers, header: true);
        int row = 1;
        foreach (var r in _powers.Scorecard())
        {
            AddRow(row++, [r.Label, r.Fired.ToString(), r.Used.ToString(), r.Dismissed.ToString(),
                r.LastUsed is { } at ? at.ToLocalTime().ToString("MMM d HH:mm") : "–", Scorecard.Verdict(r)]);
        }
    }

    private void AddRow(int row, string[] cells, bool header = false)
    {
        ScoreGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        for (int c = 0; c < cells.Length; c++)
        {
            var t = new TextBlock
            {
                Text = cells[c], FontSize = header ? 11.5 : 12.5, Margin = new Thickness(0, 3, 6, 3), TextWrapping = TextWrapping.Wrap,
                FontWeight = header || c == 0 ? FontWeights.SemiBold : FontWeights.Normal,
                Foreground = (Brush)FindResource(header ? "Muted" : c == 5 && cells[c].StartsWith('★') ? "Good" : "Ink"),
            };
            Grid.SetRow(t, row);
            Grid.SetColumn(t, c);
            ScoreGrid.Children.Add(t);
        }
    }

    private void RefreshFavorites()
    {
        FavoritesList.Children.Clear();
        var favorites = _settings.Read(s => s.Powers.Favorites.ToList());
        if (favorites.Count == 0)
            FavoritesList.Children.Add(new TextBlock { Text = "None yet.", Foreground = (Brush)FindResource("Muted"), FontSize = 12.5 });
        foreach (var f in favorites)
        {
            var row = new Grid { Margin = new Thickness(0, 2, 0, 2) };
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            var text = new TextBlock { TextTrimming = TextTrimming.CharacterEllipsis, VerticalAlignment = VerticalAlignment.Center };
            text.Inlines.Add(new System.Windows.Documents.Run(f.Label) { FontWeight = FontWeights.SemiBold });
            text.Inlines.Add(new System.Windows.Documents.Run("   " + f.Target) { Foreground = (Brush)FindResource("Muted"), FontSize = 12 });
            row.Children.Add(text);
            var remove = new Button { Content = "Remove", Style = (Style)FindResource("PillButton"), Padding = new Thickness(10, 3, 10, 3), FontSize = 12 };
            var id = f.Id;
            remove.Click += (_, _) => { _settings.Update(s => s.Powers.Favorites.RemoveAll(x => x.Id == id)); RefreshFavorites(); _powers.Republish(); };
            Grid.SetColumn(remove, 1);
            row.Children.Add(remove);
            FavoritesList.Children.Add(row);
        }
    }

    private void FavAdd_Click(object sender, RoutedEventArgs e)
    {
        var label = FavoriteRules.CleanLabel(FavLabel.Text);
        var target = FavTarget.Text.Trim().Trim('"');
        if (label is null) { FavError.Text = "Give it a short name (up to 30 characters)."; return; }
        if (!FavoriteRules.IsValidTarget(target)) { FavError.Text = "Use an https:// address, or an existing .exe, .lnk or folder."; return; }
        bool full = false;
        _settings.Update(s =>
        {
            if (s.Powers.Favorites.Count >= FavoriteRules.MaxFavorites) { full = true; return; }
            s.Powers.Favorites.Add(new Favorite { Id = Guid.NewGuid().ToString("N")[..8], Label = label, Target = target });
        });
        if (full) { FavError.Text = $"Up to {FavoriteRules.MaxFavorites} favourites."; return; }
        FavError.Text = "";
        FavLabel.Clear();
        FavTarget.Clear();
        RefreshFavorites();
        _powers.Republish();
    }

    private void FavBrowse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Filter = "Apps and shortcuts|*.exe;*.lnk;*.url;*.appref-ms", DereferenceLinks = false };
        if (dialog.ShowDialog(this) != true) return;
        FavTarget.Text = dialog.FileName;
        if (FavLabel.Text.Length == 0) FavLabel.Text = Path.GetFileNameWithoutExtension(dialog.FileName);
    }

    private void ResetApprovals_Click(object sender, RoutedEventArgs e) => _powers.ResetApprovals();

    private void ResetScores_Click(object sender, RoutedEventArgs e) => _powers.ResetScores();

    private void OpenInbox_Click(object sender, RoutedEventArgs e)
    {
        var folder = _powers.Powers.OfType<HandoffPower>().FirstOrDefault()?.InboxFolder ?? InboxStore.DefaultFolder();
        Directory.CreateDirectory(folder);
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("explorer.exe", $"\"{folder}\"") { UseShellExecute = true })?.Dispose();
    }
}
