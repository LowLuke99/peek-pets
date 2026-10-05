using System.Globalization;
using System.Net;
using System.Text.Json;
using PeekPets.Companion.Sensors;
using PeekPets.Companion.Server;
using Xunit;

namespace PeekPets.Companion.Tests;

public sealed class DisplayLayoutTests
{
    // Primary 2560x1440 at origin, a 1920x1080 monitor to the LEFT (negative coords).
    private static readonly DisplayLayout Dual = new([
        new Screen(0, 0, 2560, 1440, true),
        new Screen(-1920, 200, 1920, 1080, false),
    ]);

    [Fact]
    public void Virtual_desktop_spans_all_monitors()
    {
        Assert.Equal(new Screen(-1920, 0, 4480, 1440, false), Dual.Virtual);
    }

    [Fact]
    public void Normalizes_against_whole_desktop_and_current_monitor()
    {
        var p = Dual.Normalize(-960, 740); // center of the left monitor
        Assert.Equal(1, p.Monitor);
        Assert.Equal(0.5, p.MX, 2);
        Assert.Equal(0.5, p.MY, 2);
        Assert.Equal(960.0 / 4479, p.X, 3);
    }

    [Fact]
    public void Corners_map_to_zero_and_one()
    {
        var single = new DisplayLayout([new Screen(0, 0, 1920, 1080, true)]);
        Assert.Equal((0.0, 0.0), (single.Normalize(0, 0).X, single.Normalize(0, 0).Y));
        Assert.Equal((1.0, 1.0), (single.Normalize(1919, 1079).X, single.Normalize(1919, 1079).Y));
    }

    [Fact]
    public void Points_in_gaps_snap_to_nearest_monitor_and_clamp()
    {
        var p = Dual.Normalize(-500, 50); // above the left monitor (it starts at y=200), far from the primary
        Assert.Equal(1, p.Monitor);
        Assert.Equal(0.0, p.MY);
        Assert.InRange(p.X, 0, 1);
    }

    [Fact]
    public void Requires_at_least_one_screen()
    {
        Assert.Throws<ArgumentException>(() => new DisplayLayout([]));
    }
}

public sealed class NetworkTests
{
    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("10.0.0.206", true)]
    [InlineData("192.168.1.20", true)]
    [InlineData("172.16.5.4", true)]
    [InlineData("172.32.0.1", false)]
    [InlineData("169.254.3.3", true)]
    [InlineData("100.100.1.1", false)] // CGNAT is not "your home network"
    [InlineData("8.8.8.8", false)]
    [InlineData("26.19.120.225", false)] // Radmin VPN range: not our LAN
    [InlineData("::1", true)]
    [InlineData("fe80::1", true)]
    [InlineData("fd00::5", true)]
    [InlineData("2001:4860::8888", false)]
    [InlineData("::ffff:10.0.0.5", true)]
    public void Only_local_network_addresses_are_served(string ip, bool expected)
    {
        Assert.Equal(expected, NetworkInfo.IsLocalNetwork(IPAddress.Parse(ip)));
    }

    [Fact]
    public void Null_address_is_rejected() => Assert.False(NetworkInfo.IsLocalNetwork(null));
}

public sealed class WireFormatTests
{
    [Fact]
    public void Cursor_message_is_compact_valid_json_with_invariant_numbers()
    {
        var previous = CultureInfo.CurrentCulture;
        CultureInfo.CurrentCulture = new CultureInfo("de-DE"); // decimal comma must not leak
        try
        {
            var sample = new CursorSample(new CursorPoint(0.123456, 1, 1, 0.5, 0.25), 0, 42, 10);
            var json = ClientSession.CursorJson(sample, 1234.56);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            Assert.Equal("c", root.GetProperty("t").GetString());
            Assert.Equal(0.12346, root.GetProperty("x").GetDouble(), 5);
            Assert.Equal(1, root.GetProperty("m").GetInt32());
            Assert.Equal(42, root.GetProperty("s").GetInt64());
            Assert.Equal(1234.6, root.GetProperty("ts").GetDouble(), 1);
            Assert.True(json.Length < 100);
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public void Pairing_codes_format_for_display()
    {
        Assert.Equal("ABC-234", Pairing.Format("ABC234"));
        Assert.Equal("ABC234", Pairing.Normalize(" abc-234 "));
    }

    [Theory]
    [InlineData("10.0.0.206", true)]
    [InlineData("[fe80::1]", true)]
    [InlineData("localhost", true)]
    [InlineData("luke-pc.local", true)]
    [InlineData("evil.example", false)]   // DNS rebinding: a public name pointed at a LAN address
    [InlineData("10.0.0.206.nip.io", false)]
    [InlineData("", false)]
    public void Only_local_host_names_are_answered(string host, bool ok)
    {
        Assert.Equal(ok, PeekPets.Companion.Server.NetworkInfo.IsAllowedHost(host));
        Assert.True(PeekPets.Companion.Server.NetworkInfo.IsAllowedHost(Environment.MachineName));
    }

    [Fact]
    public void Bonjour_txt_record_carries_address_port_and_version_only()
    {
        var txt = PeekPets.Companion.Server.Bonjour.TxtRecord("LUKE-PC",
            [System.Net.IPAddress.Parse("10.0.0.206"), System.Net.IPAddress.Parse("fe80::1"), System.Net.IPAddress.Parse("192.168.1.5")], 8787, 8788, 1, "0.2.0");
        Assert.Equal("10.0.0.206,192.168.1.5", txt["ip"]);
        Assert.Equal("8787", txt["port"]);
        Assert.Equal("8788", txt["sport"]);
        Assert.Equal(["pc", "ip", "port", "sport", "proto", "ver"], txt.Keys);
    }
}
