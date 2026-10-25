# DeviceConnectionSession acceptance tests

Run with a Windows test host and a trusted HTTPS test API. Use disposable test credentials and a non-production database.

1. **Initial state:** session starts as Disconnected, with no identity.
2. **Successful connect:** valid enrolled credentials and matching `GET /v1/me` response transition to Connected and expose the verified identity.
3. **Failed authentication:** HTTP 401 leaves no identity and transitions to Faulted.
4. **Identity mismatch:** a mismatch leaves no identity and transitions to Faulted.
5. **Network/TLS failure:** no identity is exposed and state is Faulted; certificate validation is not bypassed.
6. **Cancellation:** cancellation during connection clears identity and returns to Disconnected.
7. **Disconnect:** clears only in-memory session state; the DPAPI enrollment remains available and server-side device status is unchanged.
8. **Reconnect:** after Disconnect, a new Connect performs a fresh `GET /v1/me` validation before returning to Connected.
9. **Concurrent connects:** calls are serialized; only a successfully verified identity can be exposed.
10. **Guard:** `EnsureConnected` throws unless state is Connected and a verified identity is present.
11. **Dispose:** clears in-memory identity; subsequent operations fail with ObjectDisposedException.

This session coordinator does not implement automatic retry, LAN discovery, firewall changes, UI integration, or production rollout. The API remains loopback-only.
