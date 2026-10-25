using System.Security.Cryptography;
using System.Text.Json;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Stores device enrollment state as a DPAPI CurrentUser-protected file.
/// The file is usable only by the Windows account that created it.
/// </summary>
public sealed class DeviceCredentialStore
{
    private static readonly byte[] Entropy = "HouseMix.OfflineFirst.DeviceCredentials.v1"u8.ToArray();
    private readonly string _path;

    public DeviceCredentialStore(string? path = null)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("House Mix device credentials require Windows DPAPI.");

        _path = path ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "HouseMix", "OfflineFirst", "device-credentials.bin");
    }

    public async Task<DeviceEnrollmentState?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_path)) return null;
        var protectedBytes = await File.ReadAllBytesAsync(_path, cancellationToken).ConfigureAwait(false);
        var clearBytes = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.CurrentUser);
        try
        {
            return JsonSerializer.Deserialize<DeviceEnrollmentState>(clearBytes)
                ?? throw new CryptographicException("The saved device credential file is invalid.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clearBytes);
        }
    }

    public async Task SaveAsync(DeviceEnrollmentState state, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(state);
        var clearBytes = JsonSerializer.SerializeToUtf8Bytes(state);
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

    public Task DeleteAsync(CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (File.Exists(_path)) File.Delete(_path);
        return Task.CompletedTask;
    }
}

/// <summary>
/// Pending state is persisted before the network request so a lost response can
/// be retried with the same one-time token and device key.
/// </summary>
public sealed record DeviceEnrollmentState(
    string Status,
    string DeviceKey,
    string? EnrollmentToken,
    string? DeviceId,
    string? TenantSlug,
    string? DeviceRole,
    string? DeviceLabel);
