using System.Security.Cryptography;
using HouseMix.OfflineFirst.Transport;
using Xunit;

namespace HouseMix.OfflineFirst.Transport.Tests;

public sealed class TenantRuntimeCredentialStoreTests : IDisposable
{
    private const string TenantA = "00000000-0000-4000-8000-000000000001";
    private const string TenantB = "00000000-0000-4000-8000-000000000002";
    private readonly string _root = Path.Combine(Path.GetTempPath(), "HouseMixCredentialTests", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task SaveAndLoad_RoundTripsForSameWindowsUserAndTenant()
    {
        if (!OperatingSystem.IsWindows()) return;
        var store = CreateStore(TenantA);
        var expected = CreateCredential(TenantA);

        await store.SaveAsync(expected);
        var actual = await store.LoadAsync();

        Assert.Equal(expected, actual);
        Assert.True(File.Exists(CredentialFilePath));
        Assert.NotEqual(expected.Password, Convert.ToBase64String(await File.ReadAllBytesAsync(CredentialFilePath)));
    }

    [Fact]
    public async Task Load_WithDifferentTenantEntropyCannotDecryptCredential()
    {
        if (!OperatingSystem.IsWindows()) return;
        await CreateStore(TenantA).SaveAsync(CreateCredential(TenantA));

        await Assert.ThrowsAsync<CryptographicException>(() => CreateStore(TenantB).LoadAsync());
    }

    [Fact]
    public async Task Save_RejectsCredentialForAnotherTenant()
    {
        if (!OperatingSystem.IsWindows()) return;

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateStore(TenantA).SaveAsync(CreateCredential(TenantB)));
    }

    [Fact]
    public async Task Save_RejectsInvalidDatabaseIdentityAndWeakPassword()
    {
        if (!OperatingSystem.IsWindows()) return;
        var store = CreateStore(TenantA);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            store.SaveAsync(CreateCredential(TenantA) with { DatabaseKey = "other_database" }));
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            store.SaveAsync(CreateCredential(TenantA) with { Password = "weak" }));
    }

    [Fact]
    public async Task Delete_RemovesEncryptedCredentialFile()
    {
        if (!OperatingSystem.IsWindows()) return;
        var store = CreateStore(TenantA);
        await store.SaveAsync(CreateCredential(TenantA));

        await store.DeleteAsync();

        Assert.False(File.Exists(CredentialFilePath));
        Assert.Null(await store.LoadAsync());
    }

    private TenantRuntimeCredentialStore CreateStore(string tenantId) =>
        new(tenantId, Path.Combine(_root, tenantId, "credentials"));

    private string CredentialFilePath =>
        Path.Combine(_root, TenantA, "credentials", "postgres-runtime-credential.bin");

    private static TenantRuntimeCredential CreateCredential(string tenantId)
    {
        var suffix = tenantId.EndsWith("1", StringComparison.Ordinal) ? "1" : "2";
        return new TenantRuntimeCredential(
            tenantId,
            $"hm_{new string('a', 31)}{suffix}",
            $"hm_app_{new string('b', 31)}{suffix}",
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(48)).TrimEnd('=').Replace("+", "-").Replace("/", "_"),
            DateTimeOffset.UtcNow,
            DateTimeOffset.UtcNow.AddDays(90));
    }

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true);
    }
}
