using System.Runtime.Versioning;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Server-side tenant secret provider backed by the existing per-tenant DPAPI
/// credential store. Each tenant resolves to its own protected workspace.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class DpapiTenantRuntimeSecretVault
{
    private readonly Func<string, string> _credentialsDirectoryForTenant;

    public DpapiTenantRuntimeSecretVault(Func<string, string> credentialsDirectoryForTenant)
    {
        ArgumentNullException.ThrowIfNull(credentialsDirectoryForTenant);
        if (!OperatingSystem.IsWindows())
            throw new PlatformNotSupportedException("The tenant runtime vault requires Windows DPAPI.");
        _credentialsDirectoryForTenant = credentialsDirectoryForTenant;
    }

    public async Task<TenantRuntimeSecret?> GetTenantRuntimeSecretAsync(
        string authenticatedTenantId,
        CancellationToken cancellationToken = default)
    {
        if (!Guid.TryParse(authenticatedTenantId, out var tenantGuid) || tenantGuid == Guid.Empty)
            throw new ArgumentException("An authenticated tenant UUID is required.", nameof(authenticatedTenantId));

        var tenantId = tenantGuid.ToString("D");
        var directory = _credentialsDirectoryForTenant(tenantId);
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);

        var store = new TenantRuntimeCredentialStore(tenantId, directory);
        var credential = await store.LoadUsableAsync(cancellationToken).ConfigureAwait(false);
        if (credential is null) return null;

        return new TenantRuntimeSecret(
            credential.TenantId,
            credential.DatabaseKey,
            credential.RuntimeRole,
            credential.Password);
    }
}

public sealed record TenantRuntimeSecret(
    string TenantId,
    string DatabaseKey,
    string Role,
    string Password);
