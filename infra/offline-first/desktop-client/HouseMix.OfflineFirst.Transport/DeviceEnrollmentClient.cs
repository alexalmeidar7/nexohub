using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json.Serialization;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Performs the existing one-time enrollment API contract over the HTTPS-only client.
/// </summary>
public sealed class DeviceEnrollmentClient(HttpClient httpClient, DeviceCredentialStore credentialStore)
{
    public async Task<DeviceEnrollmentState> EnrollAsync(
        string enrollmentToken,
        string label,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(credentialStore);

        if (string.IsNullOrWhiteSpace(enrollmentToken) ||
            enrollmentToken.Length is < 40 or > 64 ||
            enrollmentToken.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '_' and not '-'))
            throw new ArgumentException("The enrollment token format is invalid.", nameof(enrollmentToken));

        if (string.IsNullOrWhiteSpace(label) || label.Trim().Length > 120)
            throw new ArgumentException("Device label must contain 1–120 characters.", nameof(label));

        var saved = await credentialStore.LoadAsync(cancellationToken).ConfigureAwait(false);
        if (saved?.Status == "enrolled")
            throw new InvalidOperationException("This Windows user already has an enrolled House Mix device. Revoke or remove it before enrolling another device.");

        string deviceKey;
        if (saved?.Status == "pending")
        {
            if (!string.Equals(saved.EnrollmentToken, enrollmentToken, StringComparison.Ordinal))
                throw new InvalidOperationException("A different enrollment is pending. Retry with the original token or clear the pending enrollment.");
            deviceKey = saved.DeviceKey;
        }
        else
        {
            deviceKey = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .TrimEnd('=').Replace('+', '-').Replace('/', '_');

            // Persist both token and key before sending the request. If the response
            // is lost, the same token/key pair safely retries the server's idempotent flow.
            await credentialStore.SaveAsync(
                new DeviceEnrollmentState("pending", deviceKey, enrollmentToken, null, null, null, label.Trim()),
                cancellationToken).ConfigureAwait(false);
        }

        using var response = await httpClient.PostAsJsonAsync(
            "/v1/devices/enroll",
            new EnrollmentRequest(enrollmentToken, deviceKey, label.Trim()),
            cancellationToken).ConfigureAwait(false);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            throw new HttpRequestException(
                $"House Mix device enrollment failed ({(int)response.StatusCode}): {error}",
                null,
                response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<EnrollmentResponse>(
            cancellationToken: cancellationToken).ConfigureAwait(false)
            ?? throw new InvalidDataException("The enrollment API returned an empty response.");

        if (string.IsNullOrWhiteSpace(result.Device?.Id) ||
            string.IsNullOrWhiteSpace(result.Device.TenantSlug) ||
            string.IsNullOrWhiteSpace(result.Device.DeviceRole))
            throw new InvalidDataException("The enrollment API response is missing device identity fields.");

        var enrolled = new DeviceEnrollmentState(
            "enrolled", deviceKey, null, result.Device.Id,
            result.Device.TenantSlug, result.Device.DeviceRole, result.Device.Label);

        await credentialStore.SaveAsync(enrolled, cancellationToken).ConfigureAwait(false);
        return enrolled;
    }

    private sealed record EnrollmentRequest(
        [property: JsonPropertyName("enrollment_token")] string EnrollmentToken,
        [property: JsonPropertyName("device_key")] string DeviceKey,
        [property: JsonPropertyName("label")] string Label);

    private sealed record EnrollmentResponse(
        [property: JsonPropertyName("device")] EnrolledDevice? Device);

    private sealed record EnrolledDevice(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("tenant_slug")] string TenantSlug,
        [property: JsonPropertyName("device_role")] string DeviceRole,
        [property: JsonPropertyName("label")] string Label);
}
