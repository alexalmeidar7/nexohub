using System.Net;
using System.Security.Authentication;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Creates an HTTPS-only client for the future House Mix Desktop shell.
/// Certificate chain, validity, revocation and hostname checks are delegated
/// to the operating system's standard TLS validation. Never install a
/// permissive ServerCertificateCustomValidationCallback here.
/// </summary>
public static class LocalApiClientFactory
{
    public static HttpClient Create(Uri endpoint, TimeSpan? timeout = null)
    {
        ArgumentNullException.ThrowIfNull(endpoint);

        if (!endpoint.IsAbsoluteUri ||
            !string.Equals(endpoint.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(endpoint.Host) ||
            !string.IsNullOrEmpty(endpoint.UserInfo) ||
            !string.IsNullOrEmpty(endpoint.Fragment) ||
            !string.IsNullOrEmpty(endpoint.Query))
        {
            throw new ArgumentException(
                "The House Mix local API endpoint must be an absolute HTTPS URI without user-info or fragments.",
                nameof(endpoint));
        }

        var handler = new HttpClientHandler
        {
            AllowAutoRedirect = false,
            CheckCertificateRevocationList = true,
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
        };

        // Intentionally do not override certificate validation. The OS validates
        // the chain and the URI hostname; private station CAs must be installed
        // into the appropriate trusted OS certificate store by an administrator.
        var client = new HttpClient(handler, disposeHandler: true)
        {
            BaseAddress = endpoint.AbsoluteUri.EndsWith("/", StringComparison.Ordinal)
                ? endpoint
                : new Uri(endpoint.AbsoluteUri + "/"),
            Timeout = timeout ?? TimeSpan.FromSeconds(10)
        };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("HouseMix-Desktop-OfflineFirst/1.0");
        return client;
    }
}
