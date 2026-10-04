using System.Net;
using PeekPets.Companion.Server;
using Xunit;

namespace PeekPets.Companion.Tests;

public sealed class PairingTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "peekpets-tests-" + Guid.NewGuid().ToString("N"));
    private DateTime _now = new(2026, 10, 3, 12, 0, 0, DateTimeKind.Utc);
    private static readonly IPAddress Phone = IPAddress.Parse("10.0.0.50");
    private static readonly IPAddress Attacker = IPAddress.Parse("10.0.0.66");

    private (Pairing, CompanionSettings) Make(string? code = "ABC234")
    {
        var settings = CompanionSettings.Load(Path.Combine(_dir, "companion.json"));
        return (new Pairing(settings, () => _now, code), settings);
    }

    [Fact]
    public void Generated_codes_use_the_unambiguous_alphabet()
    {
        var (pairing, _) = Make(code: null);
        for (int i = 0; i < 50; i++)
        {
            pairing.NewCode();
            Assert.Equal(Pairing.CodeLength, pairing.Code.Length);
            Assert.All(pairing.Code, c => Assert.Contains(c, Pairing.Alphabet));
        }
    }

    [Fact]
    public void Correct_code_pairs_and_issues_a_token_that_is_stored_only_as_a_hash()
    {
        var (pairing, settings) = Make();
        var result = pairing.PairWithCode("abc-234", Phone, "Luke's iPhone");

        Assert.True(result.Ok);
        Assert.NotNull(result.NewToken);
        var device = Assert.Single(settings.Devices);
        Assert.Equal("Luke's iPhone", device.Name);
        Assert.NotEqual(result.NewToken, device.TokenHash);
        Assert.DoesNotContain(result.NewToken!, File.ReadAllText(settings.FilePath!));
    }

    [Fact]
    public void Token_reconnects_and_survives_a_restart()
    {
        var (pairing, settings) = Make();
        var token = pairing.PairWithCode("ABC234", Phone, "iPhone").NewToken;

        var reloaded = new Pairing(CompanionSettings.Load(settings.FilePath), () => _now);
        var result = reloaded.AuthWithToken(token, Phone);

        Assert.True(result.Ok);
        Assert.Null(result.NewToken);
    }

    [Fact]
    public void Wrong_code_and_wrong_token_are_refused()
    {
        var (pairing, _) = Make();
        Assert.Equal(AuthError.BadCode, pairing.PairWithCode("ZZZZZZ", Phone, null).Error);
        Assert.Equal(AuthError.BadToken, pairing.AuthWithToken("not-a-token", Phone).Error);
        Assert.Equal(AuthError.Malformed, pairing.PairWithCode("", Phone, null).Error);
        Assert.Equal(AuthError.Malformed, pairing.AuthWithToken(new string('x', 500), Phone).Error);
    }

    [Fact]
    public void Codes_expire()
    {
        var (pairing, _) = Make();
        _now += Pairing.CodeLifetime + TimeSpan.FromSeconds(1);
        Assert.Equal(AuthError.CodeExpired, pairing.PairWithCode("ABC234", Phone, null).Error);
        Assert.True(pairing.RefreshIfExpired());
    }

    [Fact]
    public void Brute_force_is_rate_limited_per_ip_and_then_released()
    {
        var (pairing, _) = Make();
        for (int i = 0; i < Pairing.MaxFailuresPerWindow; i++) pairing.PairWithCode("ZZZZZZ", Attacker, null);

        Assert.Equal(AuthError.RateLimited, pairing.PairWithCode("ABC234", Attacker, null).Error);
        Assert.True(pairing.PairWithCode("ABC234", Phone, null).Ok); // other devices unaffected

        _now += Pairing.Lockout + TimeSpan.FromSeconds(1);
        Assert.True(pairing.PairWithCode("ABC234", Attacker, null).Ok);
    }

    [Fact]
    public void Forgetting_a_device_revokes_its_token()
    {
        var (pairing, _) = Make();
        var r = pairing.PairWithCode("ABC234", Phone, "iPhone");
        pairing.Forget(r.Device!.Id);
        Assert.Equal(AuthError.BadToken, pairing.AuthWithToken(r.NewToken, Phone).Error);
    }

    [Fact]
    public void Device_names_are_sanitized()
    {
        var (pairing, _) = Make();
        var r = pairing.PairWithCode("ABC234", Phone, "evil\u0007\nname" + new string('x', 100));
        Assert.DoesNotContain('\n', r.Device!.Name);
        Assert.True(r.Device.Name.Length <= 40);
        Assert.Equal("Phone", pairing.PairWithCode("ABC234", Phone, "   ").Device!.Name);
    }

    [Fact]
    public void Corrupt_settings_file_is_kept_aside_and_replaced()
    {
        Directory.CreateDirectory(_dir);
        var path = Path.Combine(_dir, "companion.json");
        File.WriteAllText(path, "{ not json");
        var settings = CompanionSettings.Load(path);
        Assert.Empty(settings.Devices);
        Assert.True(File.Exists(path + ".corrupt"));
        Assert.True(settings.IsShared("cursor"));
        Assert.False(settings.IsShared("load"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch (IOException) { }
    }
}
