using System.Security.Cryptography;
using HouseMix.OfflineFirst.Transport;
using Xunit;

namespace HouseMix.OfflineFirst.Transport.Tests;

public sealed class LocalDatabaseCredentialStoreTests : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "HouseMix-Dpapi-Tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task SaveAndLoad_RoundTripsCredentialUnderCurrentWindowsUser()
    {
        if (!OperatingSystem.IsWindows()) return;
        var path = Path.Combine(_directory, "database-credential.bin");
        var store = new LocalDatabaseCredentialStore(path);
        const string connectionUrl = "postgres://housemix_local:secret@127.0.0.1:55432/housemix_local";

        await store.SaveAsync(connectionUrl);
        var persisted = await File.ReadAllBytesAsync(path);
        Assert.DoesNotContain("secret", Convert.ToBase64String(persisted));
        Assert.Equal(connectionUrl, await store.LoadAsync());
    }

    [Fact]
    public async Task Load_ReturnsNullWhenCredentialHasNotBeenProvisioned()
    {
        if (!OperatingSystem.IsWindows()) return;
        var store = new LocalDatabaseCredentialStore(Path.Combine(_directory, "missing.bin"));
        Assert.Null(await store.LoadAsync());
    }

    [Fact]
    public async Task Load_RejectsCorruptedProtectedCredential()
    {
        if (!OperatingSystem.IsWindows()) return;
        var path = Path.Combine(_directory, "corrupt.bin");
        Directory.CreateDirectory(_directory);
        await File.WriteAllBytesAsync(path, [1, 2, 3, 4, 5]);
        var store = new LocalDatabaseCredentialStore(path);
        await Assert.ThrowsAsync<CryptographicException>(() => store.LoadAsync());
    }

    [Theory]
    [InlineData("")]
    [InlineData("https://localhost/database")]
    [InlineData("postgres://localhost/database")]
    public async Task Save_RejectsInvalidOrCredentialFreeUrls(string value)
    {
        if (!OperatingSystem.IsWindows()) return;
        var store = new LocalDatabaseCredentialStore(Path.Combine(_directory, "invalid.bin"));
        await Assert.ThrowsAsync<ArgumentException>(() => store.SaveAsync(value));
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
    }
}
