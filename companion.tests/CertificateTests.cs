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
        var status = chain.ChainStatus.Aggregate(X509ChainStatusFlags.NoError, (acc, s) => acc | s.Status);
        // Chain elements are extra certificate objects; on macOS they keep the temp keychain alive.
        foreach (var element in chain.ChainElements) element.Certificate.Dispose();
        return status;
    }

    [Fact]
    public void Lan_server_certificate_chains_to_the_local_ca()
    {
        using var certs = new LocalCertificates(_dir);
        var leaf = certs.ServerCertificate([IPAddress.Parse("10.0.0.206"), IPAddress.Parse("192.168.1.9")], "LUKE-PC");

        Assert.True(leaf.HasPrivateKey);
        Assert.Equal(X509ChainStatusFlags.NoError, Validate(certs.Authority, leaf));
        Assert.Contains("10.0.0.206", leaf.GetNameInfo(X509NameType.DnsName, false) + string.Join(",", SanText(leaf)));
    }

    [Fact]
    public void Ca_cannot_vouch_for_public_websites()
    {
        using var certs = new LocalCertificates(_dir);
        // Forge a cert for a real domain, signed by our CA, as an attacker with the key would.
        using var key = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var req = new CertificateRequest("CN=www.google.com", key, HashAlgorithmName.SHA256);
        var san = new SubjectAlternativeNameBuilder();
        san.AddDnsName("www.google.com");
        req.CertificateExtensions.Add(san.Build());
        var now = DateTimeOffset.UtcNow;
        using var forged = req.Create(certs.Authority, now.AddMinutes(-1), now.AddDays(30), [1, 2, 3, 4]);

        var status = Validate(certs.Authority, forged);
        // Windows reports HasNotPermittedNameConstraint; macOS reports InvalidNameConstraints. Both reject the chain.
        var rejected = X509ChainStatusFlags.HasNotPermittedNameConstraint | X509ChainStatusFlags.InvalidNameConstraints;
        Assert.True((status & rejected) != 0, status.ToString());
    }

    [Fact]
    public void Ca_is_reused_across_restarts_and_leaf_is_reissued_when_ip_changes()
    {
        using var first = new LocalCertificates(_dir);
        var thumb = first.Authority.Thumbprint;
        var leafA = first.ServerCertificate([IPAddress.Parse("10.0.0.5")], "PC");
        var leafB = first.ServerCertificate([IPAddress.Parse("10.0.0.6")], "PC");
        Assert.NotEqual(leafA.Thumbprint, leafB.Thumbprint);
        Assert.Same(leafB, first.ServerCertificate([IPAddress.Parse("10.0.0.6")], "PC"));

        using var second = new LocalCertificates(_dir);
        Assert.Equal(thumb, second.Authority.Thumbprint);
        Assert.False(File.Exists(Path.Combine(_dir, "ca.pfx")), "key must not be stored unencrypted");
        Assert.Matches("^([0-9A-F]{2}:){31}[0-9A-F]{2}$", second.AuthorityFingerprint);
        Assert.DoesNotContain("PRIVATE", System.Text.Encoding.ASCII.GetString(second.AuthorityDer));
        Assert.False(new X509Certificate2(second.AuthorityDer).HasPrivateKey);
    }

    [Fact]
    public void Legacy_unencrypted_ca_is_migrated_and_still_signs()
    {
        Directory.CreateDirectory(_dir);
        using (var key = ECDsa.Create(ECCurve.NamedCurves.nistP256))
        {
            var req = new CertificateRequest("CN=Legacy", key, HashAlgorithmName.SHA256);
            req.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, true, 0, true));
            req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign, true));
            req.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(req.PublicKey, false));
            using var legacy = req.CreateSelfSigned(DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddYears(2));
            File.WriteAllBytes(Path.Combine(_dir, "ca.pfx"), legacy.Export(X509ContentType.Pfx));
        }
        using var certs = new LocalCertificates(_dir);
        var leaf = certs.ServerCertificate([IPAddress.Parse("10.0.0.9")], "PC");
        Assert.True(leaf.HasPrivateKey);
        Assert.False(File.Exists(Path.Combine(_dir, "ca.pfx")));
        Assert.True(File.Exists(certs.KeyFile));
    }

    private static IEnumerable<string> SanText(X509Certificate2 cert) =>
        cert.Extensions.OfType<X509SubjectAlternativeNameExtension>().SelectMany(e => e.EnumerateIPAddresses().Select(i => i.ToString()));

    public void Dispose()
    {
        try { Directory.Delete(_dir, true); } catch (IOException) { }
    }
}
