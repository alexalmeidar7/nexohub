using System.Runtime.Versioning;
using System.Security.Cryptography;
using HouseMix.OfflineFirst.Transport;
using Xunit;

namespace HouseMix.OfflineFirst.Transport.Tests;

[SupportedOSPlatform("windows")]
public sealed class DpapiTenantRuntimeSecretVaultTests : IDisposable
{
    private const string TenantA = "00000000-0000-4000-8000-000000000001";
    private const string TenantB = "00000000-0000-4000-8000-000000000002";
    private readonly string _root = Path.Combine(Path.GetTempPath(), "HouseMixDpapiVaultTests", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task RetrievesOnlyTheSecretForTheAuthenticatedTenant()
    {
        if (!OperatingSystem.IsWindows()) return;
        var credentialA = Credential(TenantA);
        var credentialB = Credential(TenantB);
        await Store(TenantA).SaveAsync(credentialA);
        await Store(TenantB).SaveAsync(credentialB);
        var requested = new List<string>();
        var vault = new DpapiTenantRuntimeSecretVault(id =>
        {
            requested.Add(id);
            return DirectoryFor(id);
        });

        var secret = await vault.GetTenantRuntimeSecretAsync(TenantA);

        Assert.Equal(new[] { TenantA }, requested);
        Assert.NotNull(secret);
        Assert.Equal(TenantA, secret.TenantId);
        Assert.Equal(credentialA.RuntimeRole, secret.Role);
        Assert.Equal(credentialA.Password, secret.Password);
    }

    [Fact]
    public async Task ReturnsNullWhenTenantHasNoProvisionedSecret()
    {
        if (!OperatingSystem.IsWindows()) return;
        var vault = new DpapiTenantRuntimeSecretVault(DirectoryFor);
        Assert.Null(await vault.GetTenantRuntimeSecretAsync(TenantA));
    }

    [Fact]
    public async Task RejectsInvalidTenantBeforeResolvingStorage()
    {
        if (!OperatingSystem.IsWindows()) return;
        var resolved = false;
        var vault = new DpapiTenantRuntimeSecretVault(_ =>
        {
            resolved = true;
            return _root;
        });

        await Assert.ThrowsAsync<ArgumentException>(() => vault.GetTenantRuntimeSecretAsync("radio-positiva"));
        Assert.False(resolved);
    }

    [Fact]
    public async Task DoesNotReturnExpiredCredential()
    {
        if (!OperatingSystem.IsWindows()) return;
        await Store(TenantA).SaveAsync(Credential(TenantA) with { ExpiresAtUtc = DateTimeOffset.UtcNow.AddMinutes(-1) });
        var vault = new DpapiTenantRuntimeSecretVault(DirectoryFor);

        await Assert.ThrowsAsync<InvalidOperationException>(() => vault.GetTenantRuntimeSecretAsync(TenantA));
    }

    [Fact]
    public void RequiresWindowsDpapi()
    {
        if (OperatingSystem.IsWindows()) return;
        Assert.Throws<PlatformNotSupportedException>(() => new DpapiTenantRuntimeSecretVault(DirectoryFor));
    }

    private string DirectoryFor(string tenantId) => Path.Combine(_root, tenantId, "credentials");
    private TenantRuntimeCredentialStore Store(string tenantId) => new(tenantId, DirectoryFor(tenantId));

    private static TenantRuntimeCredential Credential(string tenantId)
    {
        var suffix = tenantId.EndsWith("1", StringComparison.Ordinal) ? "1" : "2";
        return new TenantRuntimeCredential(
            tenantId,
            $"hm_{new string('a', 31)}{suffix}",
            $"hm_app_{new string('b', 31)}{suffix}",
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)).TrimEnd('=').Replace("+", "-").Replace("/", "_"),
            DateTimeOffset.UtcNow.AddMinutes(-1),
            DateTimeOffset.UtcNow.AddDays(30));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}
