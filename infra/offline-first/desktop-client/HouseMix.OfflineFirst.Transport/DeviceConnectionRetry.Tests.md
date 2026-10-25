# Desktop connection retry — acceptance matrix

These are required Windows acceptance scenarios for the connection retry policy. They are a manual acceptance checklist, not an automated test suite.

## Policy
- Default: 3 total attempts (the first request plus at most 2 retries).
- Exponential delay starts at 1 second, doubles per retry, and is capped at 8 seconds.
- Each delay receives bounded ±20% jitter.
- Configurable attempts are limited to 1–5; maximum delay cannot exceed 30 seconds.
- Cancellation interrupts both the active request and any pending delay.

## Scenarios
1. First request succeeds: one request; state becomes Connected only after identity validation.
2. Connection refused / transport failure: retry within the configured bound; success on a later attempt connects.
3. HTTP 408, 429, or 5xx: retry within the configured bound.
4. HTTP 4xx other than 408/429: fail immediately; no retry.
5. 401 / revoked device: fail immediately; state becomes Faulted and no identity remains in memory.
6. Server identity mismatch or malformed identity response: fail immediately; no retry and no identity remains in memory.
7. TLS certificate/hostname validation failure: fail closed; no certificate bypass and no LAN fallback.
8. Cancellation during request or backoff: state returns to Disconnected and cancellation propagates.
9. Retry budget exhausted: state becomes Faulted; no identity remains in memory.
10. Disconnect after success: in-memory identity is cleared; DPAPI enrollment remains intact.
11. Invalid retry options: constructor rejects attempts outside 1–5, non-positive delays, max delay below initial delay, or max delay above 30 seconds.

## Safety boundary
This retry policy does not perform LAN discovery, change firewall rules, bind the API to a network interface, bypass TLS, renew credentials, or enable LAN mode. The API remains loopback-only.
