# House Mix Desktop — local API transport and enrollment

This is an isolated .NET 8 transport foundation for the future House Mix Desktop client. It is not wired into the current Web app, NexoHub Bridge, or production services.

## Endpoint rules

- Accept only an absolute `https://` URI. Plain HTTP, relative URIs, user-info and URI fragments are rejected before a request is made.
- The operating system's standard TLS validation is authoritative: certificate chain, validity, revocation and hostname/SAN must validate.
- Never set `ServerCertificateCustomValidationCallback` to accept all certificates, ignore hostname errors, or implement a trust-on-first-use prompt.
- For a private station CA, an administrator must provision the CA certificate into the correct trusted OS certificate store using a documented, authenticated installation process. Do not silently trust a certificate downloaded from the server being contacted.
- Redirects are disabled so an HTTPS endpoint cannot redirect the client to another host or downgrade transport.
- TLS protocol negotiation is left to the .NET/OS secure defaults; the server prototype already enforces TLS 1.2 minimum.

## Device enrollment

`DeviceEnrollmentClient` implements the API's existing `POST /v1/devices/enroll` contract. It generates a 256-bit device key, sends the one-time enrollment token, and accepts tenant/role identity only from the server response.

Before making the request, the client saves the pending token and device key in a DPAPI CurrentUser-protected file under the Windows user's LocalApplicationData directory. If the response is lost, retrying with the same token reuses the same key and matches the API's idempotent retry behavior. After success, the token is discarded from persisted state and only the device key and returned device identity remain.

A pending enrollment cannot be silently replaced with a different token. An already enrolled Windows user cannot enroll another device through this client. Remote revocation and credential rotation UX are not included.

## Credential security and platform

The credential store is Windows-only and throws on other operating systems. It uses the `System.Security.Cryptography.ProtectedData` package and DPAPI CurrentUser scope; it does not store plaintext credentials or place secrets in browser/renderer storage. The credential file inherits the current user's LocalApplicationData directory permissions. Device revocation remains an administrator action through the existing local CLI.

## Current scope

The API remains loopback-only. This work does not enable LAN binding, connect the current Desktop UI, modify production services, or touch production databases.

## Build

```powershell
dotnet build .\HouseMix.OfflineFirst.Transport\HouseMix.OfflineFirst.Transport.csproj --configuration Release
```

See `CONNECTION-SECURITY.md` and `HouseMix.OfflineFirst.Transport/DeviceCredentialStore.Tests.md` for acceptance and Windows test requirements.
