using System.Net;
using System.Text;
using System.Text.Json;
using PeekPets.Companion.Platform;
using PeekPets.Companion.Platform.Mac;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;
using Xunit;

namespace PeekPets.Companion.Tests;

public sealed class MacDisplayTests
{
    private static MacNative.CGRect Rect(double x, double y, double w, double h) => new() { X = x, Y = y, Width = w, Height = h };

    [Fact]
    public void Main_display_comes_first_and_points_map_to_fractions()
    {
        // A 1512x982 laptop with a 2560x1440 monitor above-left (negative coordinates, like macOS reports).
        var layout = MacDisplays.LayoutFrom([(Rect(-1048, -1440, 2560, 1440), false), (Rect(0, 0, 1512, 982), true)]);

        Assert.True(layout.Screens[0].Primary);
        Assert.Equal(new Screen(0, 0, 1512, 982, true), layout.Screens[0]);
        var p = layout.Normalize(1511, 981); // bottom-right point of the laptop
        Assert.Equal(0, p.Monitor);
        Assert.Equal(1.0, p.MX, 3);
        Assert.Equal(1.0, p.MY, 3);
        var up = layout.Normalize(-1048, -1440); // top-left of the external monitor
        Assert.Equal(1, up.Monitor);
        Assert.Equal(0.0, up.X, 3);
        Assert.Equal(0.0, up.Y, 3);
    }

    [Fact]
    public void Empty_or_zero_sized_display_lists_fall_back_to_one_screen()
    {
        var layout = MacDisplays.LayoutFrom([(Rect(0, 0, 0, 0), true)]);
        Assert.Single(layout.Screens);
    }

    [Fact]
    public void Live_cursor_and_displays_read_on_a_mac()
    {
        if (!OperatingSystem.IsMacOS()) return;
        var source = new MacCursorSource();
        var layout = source.ReadLayout();
        Assert.NotEmpty(layout.Screens);
        Assert.Contains(layout.Screens, s => s.Primary);
        Assert.True(source.TryGetCursor(out int x, out int y));
        var p = layout.Normalize(x, y);
        Assert.InRange(p.X, 0, 1);
        Assert.InRange(p.Y, 0, 1);
        Assert.InRange(source.ReadButtons(), 0, 7);
    }
}

public sealed class PmsetTests
{
    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value);

    [Fact]
    public void Laptop_on_battery()
    {
        var v = Json(PmsetParser.Parse("Now drawing from 'Battery Power'\n -InternalBattery-0 (id=20643939)\t42%; discharging; 1:54 remaining present: true\n", saver: true));
        Assert.True(v.GetProperty("available").GetBoolean());
        Assert.Equal(42, v.GetProperty("percent").GetInt32());
        Assert.False(v.GetProperty("charging").GetBoolean());
        Assert.False(v.GetProperty("pluggedIn").GetBoolean());
        Assert.True(v.GetProperty("saver").GetBoolean());
    }

    [Theory]
    [InlineData("charging; 0:40 remaining present: true", true)]
    [InlineData("finishing charge; 0:05 remaining present: true", true)]
    [InlineData("charged; 0:00 remaining present: true", false)]
    [InlineData("AC attached; not charging present: true", false)]
    public void Laptop_on_power(string tail, bool charging)
    {
        var v = Json(PmsetParser.Parse($"Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; {tail}\n", saver: false));
        Assert.Equal(100, v.GetProperty("percent").GetInt32());
        Assert.Equal(charging, v.GetProperty("charging").GetBoolean());
        Assert.True(v.GetProperty("pluggedIn").GetBoolean());
    }

    [Fact]
    public void Desktop_mac_reports_no_battery()
    {
        var v = Json(PmsetParser.Parse("Now drawing from 'AC Power'\n", saver: false));
        Assert.False(v.GetProperty("available").GetBoolean());
        Assert.Equal("no_battery", v.GetProperty("reason").GetString());
        Assert.True(v.GetProperty("pluggedIn").GetBoolean());
    }

    [Fact]
    public void Low_power_mode_is_read_from_pmset_settings()
    {
        Assert.True(PmsetParser.LowPowerMode("System-wide power settings:\n lowpowermode         1\n sleep 1\n"));
        Assert.False(PmsetParser.LowPowerMode(" lowpowermode         0\n"));
        Assert.False(PmsetParser.LowPowerMode(null));
    }
}

public sealed class BonjourTests
{
    [Fact]
    public void Txt_record_is_length_prefixed_key_value_pairs()
    {
        var bytes = Bonjour.EncodeTxt(new() { ["pc"] = "Mac", ["port"] = "8787" });
        byte[] expected = [6, .."pc=Mac"u8.ToArray(), 9, .."port=8787"u8.ToArray()];
        Assert.Equal(expected, bytes);
    }

    [Fact]
    public void Long_values_are_cut_to_255_bytes_and_empty_records_are_one_zero_byte()
    {
        var bytes = Bonjour.EncodeTxt(new() { ["k"] = new string('x', 400) });
        Assert.Equal(255, bytes[0]);
        Assert.Equal(256, bytes.Length);
        Assert.Equal(new byte[] { 0 }, Bonjour.EncodeTxt([]));
    }

    [Fact]
    public void Instance_names_are_dns_safe()
    {
        Assert.Equal("LukesMacBookAir", Bonjour.Sanitize("Luke's MacBook Air"));
        Assert.Equal("PeekPets-PC", Bonjour.Sanitize("’’’"));
    }

    [Fact]
    public void Txt_record_carries_the_friendly_name_and_ports()
    {
        var txt = Bonjour.TxtRecord("Luke's MacBook Air", [IPAddress.Parse("10.0.0.5")], 8787, 8788, 1, "0.2.0");
        Assert.Equal("Luke's MacBook Air", txt["pc"]);
        Assert.Equal("8788", txt["sport"]);
        Assert.Contains("pc=Luke's MacBook Air", Encoding.UTF8.GetString(Bonjour.EncodeTxt(txt)));
    }
}

public sealed class OwnerOnlyVaultTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "peekpets-vault-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Key_file_and_folder_are_readable_only_by_this_user()
    {
        if (OperatingSystem.IsWindows()) return; // Windows uses DPAPI
        var vault = new OwnerOnlyKeyVault();
        vault.Save(_dir, [1, 2, 3]);

        Assert.Equal(OwnerOnlyKeyVault.FolderMode, File.GetUnixFileMode(_dir));
        Assert.Equal(OwnerOnlyKeyVault.FileMode, File.GetUnixFileMode(Path.Combine(_dir, vault.FileName)));
        Assert.Equal(new byte[] { 1, 2, 3 }, vault.Load(_dir));
    }

    [Fact]
    public void Saving_tightens_a_loose_existing_file()
    {
        if (OperatingSystem.IsWindows()) return;
        var vault = new OwnerOnlyKeyVault();
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, vault.FileName);
        File.WriteAllBytes(path, [9]);
        File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.OtherRead);

        vault.Save(_dir, [4]);
        Assert.Equal(OwnerOnlyKeyVault.FileMode, File.GetUnixFileMode(path));
        Assert.Equal(new byte[] { 4 }, vault.Load(_dir));
    }

    [Fact]
    public void Platform_picks_the_right_vault()
    {
        var vault = PlatformServices.CreateKeyVault();
        Assert.Equal(OperatingSystem.IsWindows() ? "ca.pfx.dpapi" : "ca.p12", vault.FileName);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, true); } catch (IOException) { }
    }
}
