# House Mix Desktop — local API transport contract

This is an isolated .NET 8 transport foundation for the future House Mix Desktop client. It is not wired into the current Web app, NexoHub Bridge, or production services.

## Endpoint rules

- Accept only an absolute `https://` URI. Plain HTTP, relative URIs, user-info and URI fragments are rejected before a request is made.
- The operating system's standard TLS validation is authoritative: certificate chain, validity, revocation and hostname/SAN must validate.
- Never set `ServerCertificateCustomValidationCallback` to accept all certificates, ignore hostname errors, or implement a trust-on-first-use prompt.
- For a private station CA, an administrator must provision the CA certificate into the correct trusted OS certificate store using a documented, authenticated installation process. Do not silently trust a certificate downloaded from the server being contacted.
- Redirects are disabled so an HTTPS endpoint cannot redirect the client to another host or downgrade transport.
- TLS protocol negotiation is left to the .NET/OS secure defaults; the server prototype already enforces TLS 1.2 minimum.
- Device authentication is separate from TLS. Device keys must be provisioned by the enrollment flow and stored using Windows-protected storage; never embed keys in the renderer or source code.

## Current scope

The `HouseMix.OfflineFirst.Transport` project exposes a small HTTPS-only `HttpClient` factory. It does not yet perform enrollment, persist credentials, call sync endpoints, enable LAN binding, or alter any production database. The API remains loopback-only.

## Verification

From this directory:

```powershell
dotnet build .\HouseMix.OfflineFirst.Transport\HouseMix.OfflineFirst.Transport.csproj --configuration Release
```

The next integration stage must add tests for trusted private CA, untrusted issuer, expired certificate, hostname mismatch, revoked certificate where supported by the test PKI, redirect rejection, and HTTP endpoint rejection before connecting this factory to the Desktop UI.
