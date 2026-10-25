namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Enforces the validity window of a tenant runtime credential immediately
/// before it is handed to a database connection layer.
/// </summary>
public static class TenantRuntimeCredentialPolicy
{
    private static readonly TimeSpan AllowedClockSkew = TimeSpan.FromMinutes(5);

    public static void EnsureUsable(
        TenantRuntimeCredential credential,
        DateTimeOffset? now = null)
    {
        ArgumentNullException.ThrowIfNull(credential);
        var currentTime = now ?? DateTimeOffset.UtcNow;

        if (credential.CreatedAtUtc > currentTime.Add(AllowedClockSkew))
            throw new InvalidOperationException("tenant_runtime_credential_not_yet_valid");

        if (credential.ExpiresAtUtc is { } expiresAt)
        {
            if (expiresAt <= credential.CreatedAtUtc)
                throw new InvalidOperationException("tenant_runtime_credential_expiry_invalid");
            if (expiresAt <= currentTime)
                throw new InvalidOperationException("tenant_runtime_credential_expired");
        }
    }
}
