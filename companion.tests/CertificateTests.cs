using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using PeekPets.Companion.Server;
using Xunit;

namespace PeekPets.Companion.Tests;

public sealed class CertificateTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "peekpets-certs-" + Guid.NewGuid().ToString("N"));

    private X509ChainStatusFlags Validate(X509Certificate2 ca, X509Certificate2 leaf)
    {
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(ca);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
        chain.Build(leaf);
        return chain.ChainStatus.Aggregate(X509ChainStatusFlags.NoError, (acc, s) => acc | s.Status);
    }

    [Fact]
    public void Lan_server_certificate_chains_to_the_local_ca()
    {
        var certs = new LocalCertificates(_dir);
        var leaf = certs.ServerCertificate([IPAddress.Parse("10.0.0.206"), IPAddress.Parse("192.168.1.9")], "LUKE-PC");

        Assert.True(leaf.HasPrivateKey);
        Assert.Equal(X509ChainStatusFlags.NoError, Validate(certs.Authority, leaf));
        Assert.Contains("10.0.0.206", leaf.GetNameInfo(X509NameType.DnsName, false) + string.Join(",", SanText(leaf)));
    }

    [Fact]
    public void Ca_cannot_vouch_for_public_websites()
    {
        var certs = new LocalCertificates(_dir);
        // Forge a cert for a real domain, signed by our CA, as an attacker with the key would.
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest("CN=www.google.com", key, HashAlgorithmName.SHA256);
        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName("www.google.com");
        req.CertificateExtensions.Add(san.Build());
        var now = DateTimeOffset.UtcNow;
        using var forged = req.Create(certs.Authority, now.AddMinutes(-1), now.AddDays(30), [1, 2, 3, 4]);

        var status = Validate(certs.Authority, forged);
        Assert.True(status.HasFlag(X509ChainStatusFlags.HasNotPermittedNameConstraint), status.ToString());
    }

    [Fact]
    public void Ca_is_reused_across_restarts_and_leaf_is_reissued_when_ip_changes()
    {
        var first = new LocalCertificates(_dir);
        var thumb = first.Authority.Thumbprint;
        var leafA = first.ServerCertificate([IPAddress.Parse("10.0.0.5")], "PC");
        var leafB = first.ServerCertificate([IPAddress.Parse("10.0.0.6")], "PC");
        Assert.NotEqual(leafA.Thumbprint, leafB.Thumbprint);
        Assert.Same(leafB, first.ServerCertificate([IPAddress.Parse("10.0.0.6")], "PC"));

        var second = new LocalCertificates(_dir);
        Assert.Equal(thumb, second.Authority.Thumbprint);
        Assert.DoesNotContain("PRIVATE", System.Text.Encoding.ASCII.GetString(second.AuthorityDer));
        Assert.False(new X509Certificate2(second.AuthorityDer).HasPrivateKey);
    }

    private static IEnumerable<string> SanText(X509Certificate2 cert) =>
        cert.Extensions.OfType<X509SubjectAlternativeNameExtension>().SelectMany(e => e.EnumerateIPAddresses().Select(i => i.ToString()));

    public void Dispose()
    {
        try { Directory.Delete(_dir, true); } catch (IOException) { }
    }
}
