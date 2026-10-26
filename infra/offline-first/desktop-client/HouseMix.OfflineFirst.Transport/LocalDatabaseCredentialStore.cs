using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Protects the local PostgreSQL connection URL with Windows DPAPI CurrentUser.
/// The protected file is bound to the Windows account that provisions the station.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class LocalDatabaseCredentialStore
{
    private static readonly byte[] Entropy = "HouseMix.OfflineFirst.LocalDatabaseCredential.v1"u8.ToArray();
    private readonly string _path;

    public LocalDatabaseCredentialStore(string? path = null)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Local database credentials require Windows DPAPI.");

        _path = path ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "HouseMix", "OfflineFirst", "database-credential.bin");
    }

    public async Task SaveAsync(string connectionUrl, CancellationToken cancellationToken = default)
    {
        ValidateConnectionUrl(connectionUrl);
        var clearBytes = Encoding.UTF8.GetBytes(connectionUrl);
        byte[] protectedBytes;
        try
        {
            protectedBytes = ProtectedData.Protect(clearBytes, Entropy, DataProtectionScope.CurrentUser);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clearBytes);
        }

        var directory = Path.GetDirectoryName(_path)
            ?? throw new InvalidOperationException("Credential path must include a directory.");
        Directory.CreateDirectory(directory);
        var temporaryPath = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await File.WriteAllBytesAsync(temporaryPath, protectedBytes, cancellationToken).ConfigureAwait(false);
            File.Move(temporaryPath, _path, overwrite: true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(protectedBytes);
            if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
        }
    }

    public async Task<string?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_path)) return null;
        var protectedBytes = await File.ReadAllBytesAsync(_path, cancellationToken).ConfigureAwait(false);
        byte[] clearBytes;
        try
        {
            clearBytes = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(protectedBytes);
        }

        try
        {
            var connectionUrl = Encoding.UTF8.GetString(clearBytes);
            ValidateConnectionUrl(connectionUrl);
            return connectionUrl;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clearBytes);
        }
    }

    public Task DeleteAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (File.Exists(_path)) File.Delete(_path);
        return Task.CompletedTask;
    }

    private static void ValidateConnectionUrl(string value)
    {
        if (string.IsNullOrWhiteSpace(value) ||
            !Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
            uri.Scheme is not ("postgres" or "postgresql") ||
            string.IsNullOrWhiteSpace(uri.Host) ||
            uri.UserInfo.Length == 0)
            throw new ArgumentException("A valid PostgreSQL connection URL with credentials is required.", nameof(value));
    }
}
