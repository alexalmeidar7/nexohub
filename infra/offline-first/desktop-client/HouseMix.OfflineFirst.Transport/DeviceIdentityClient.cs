using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Authenticates an enrolled Desktop station against GET /v1/me and verifies
/// that the server identity still matches the locally protected enrollment.
/// </summary>
public sealed class DeviceIdentityClient(HttpClient httpClient, DeviceCredentialStore credentialStore)
{
    public async Task<DeviceIdentity> GetCurrentAsync(CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(credentialStore);

        var saved = await credentialStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (saved is null || !string.Equals(saved.Status, "enrolled", StringComparison.Ordinal) ||
            string.IsNullOrWhiteSpace(saved.DeviceKey) ||
            string.IsNullOrWhiteSpace(saved.DeviceId) ||
            string.IsNullOrWhiteSpace(saved.TenantSlug) ||
            string.IsNullOrWhiteSpace(saved.DeviceRole))
        {
            throw new InvalidOperationException("This Windows user does not have a complete enrolled House Mix device identity.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, "/v1/me");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", saved.DeviceKey);

        using var response = await httpClient.SendAsync(
            request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);

        if (response.StatusCode == HttpStatusCode.Unauthorized)
            throw new DeviceAuthenticationException("The House Mix station was rejected. The device may have been revoked; re-enrollment requires a new administrator-issued token.");

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"House Mix identity validation failed ({(int)response.StatusCode}).",
                null,
                response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<IdentityResponse>(
            cancellationToken: cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidDataException("The identity API returned an empty response.");

        var device = result.Device;
        if (device is null ||
            string.IsNullOrWhiteSpace(device.Id) ||
            string.IsNullOrWhiteSpace(device.TenantSlug) ||
            string.IsNullOrWhiteSpace(device.DeviceRole) ||
            string.IsNullOrWhiteSpace(device.Label))
        {
            throw new InvalidDataException("The identity API response is missing required device fields.");
        }

        // Never silently replace local identity based on a response. A mismatch
        // is a hard failure and requires an explicit administrative recovery.
        if (!string.Equals(device.Id, saved.DeviceId, StringComparison.Ordinal) ||
            !string.Equals(device.TenantSlug, saved.TenantSlug, StringComparison.Ordinal) ||
            !string.Equals(device.DeviceRole, saved.DeviceRole, StringComparison.Ordinal) ||
            !string.Equals(device.Label, saved.DeviceLabel, StringComparison.Ordinal))
        {
            throw new DeviceIdentityMismatchException(
                "The server identity does not match this Windows user's protected enrollment. Connection was refused.");
        }

        return new DeviceIdentity(device.Id, device.TenantSlug, device.DeviceRole, device.Label);
    }

    private sealed record IdentityResponse(
        [property: JsonPropertyName("device")] IdentityDevice? Device);

    private sealed record IdentityDevice(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("tenant_slug")] string TenantSlug,
        [property: JsonPropertyName("device_role")] string DeviceRole,
        [property: JsonPropertyName("label")] string Label);
}

public sealed record DeviceIdentity(string DeviceId, string TenantSlug, string DeviceRole, string Label);

public sealed class DeviceAuthenticationException(string message) : UnauthorizedAccessException(message);

public sealed class DeviceIdentityMismatchException(string message) : UnauthorizedAccessException(message);
