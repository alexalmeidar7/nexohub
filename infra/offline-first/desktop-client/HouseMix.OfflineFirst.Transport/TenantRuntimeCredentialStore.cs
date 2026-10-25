using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Runtime.Versioning;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Stores one radio's PostgreSQL runtime secret in that client's workspace.
/// DPAPI CurrentUser binds the blob to the Windows account; additional entropy
/// binds it to the tenant UUID. The workspace path must be the credentials
/// directory resolved for the selected House Mix client profile.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class TenantRuntimeCredentialStore
{
    private const string FileName = "postgres-runtime-credential.bin";
    private static readonly byte[] EntropyPrefix = "HouseMix.OfflineFirst.TenantRuntimeCredential.v1:"u8.ToArray();
    private readonly string _tenantId;
    private readonly string _path;
    private readonly byte[] _entropy;

    public TenantRuntimeCredentialStore(string tenantId, string clientCredentialsDirectory)
    {
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("Tenant runtime credentials require Windows DPAPI.");
        if (!Guid.TryParse(tenantId, out var parsedTenantId) || parsedTenantId == Guid.Empty)
            throw new ArgumentException("A valid tenant UUID is required.", nameof(tenantId));
        ArgumentException.ThrowIfNullOrWhiteSpace(clientCredentialsDirectory);

        _tenantId = parsedTenantId.ToString("D");
        var fullDirectory = Path.GetFullPath(clientCredentialsDirectory);
        _path = Path.Combine(fullDirectory, FileName);
        _entropy = EntropyPrefix.Concat(Encoding.UTF8.GetBytes(_tenantId)).ToArray();
    }

    public async Task<TenantRuntimeCredential?> LoadAsync(CancellationToken cancellationToken = default)
    {
        if (!File.Exists(_path)) return null;
        var protectedBytes = await File.ReadAllBytesAsync(_path, cancellationToken).ConfigureAwait(false);
        byte[] clearBytes;
        try
        {
            clearBytes = ProtectedData.Unprotect(protectedBytes, _entropy, DataProtectionScope.CurrentUser);
        }
        catch (CryptographicException)
        {
            throw new CryptographicException("Tenant credential cannot be decrypted for this Windows user and tenant.");
        }
        finally
        {
            CryptographicOperations.ZeroMemory(protectedBytes);
        }

        try
        {
            var credential = JsonSerializer.Deserialize<TenantRuntimeCredential>(clearBytes)
                ?? throw new CryptographicException("Tenant credential file is invalid.");
            Validate(credential);
            return credential;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clearBytes);
        }
    }

    public async Task SaveAsync(TenantRuntimeCredential credential, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(credential);
        Validate(credential);
        var clearBytes = JsonSerializer.SerializeToUtf8Bytes(credential);
        byte[] protectedBytes;
        try
        {
            protectedBytes = ProtectedData.Protect(clearBytes, _entropy, DataProtectionScope.CurrentUser);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(clearBytes);
        }

        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
        var temporaryPath = _path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            await using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await stream.WriteAsync(protectedBytes, cancellationToken).ConfigureAwait(false);
                await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
            }
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

    private void Validate(TenantRuntimeCredential credential)
    {
        if (!Guid.TryParse(credential.TenantId, out var tenantId) ||
            !string.Equals(tenantId.ToString("D"), _tenantId, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Tenant credential does not belong to this client workspace.");
        if (!System.Text.RegularExpressions.Regex.IsMatch(credential.DatabaseKey, "^hm_[a-f0-9]{32}$") ||
            !System.Text.RegularExpressions.Regex.IsMatch(credential.RuntimeRole, "^hm_app_[a-f0-9]{32}$"))
            throw new InvalidOperationException("Tenant database identity is invalid.");
        if (string.IsNullOrWhiteSpace(credential.Password) || credential.Password.Length < 48 ||
            !System.Text.RegularExpressions.Regex.IsMatch(credential.Password, "^[A-Za-z0-9_-]+$"))
            throw new InvalidOperationException("Tenant runtime password is invalid.");
    }
}

public sealed record TenantRuntimeCredential(
    string TenantId,
    string DatabaseKey,
    string RuntimeRole,
    string Password,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? ExpiresAtUtc);
