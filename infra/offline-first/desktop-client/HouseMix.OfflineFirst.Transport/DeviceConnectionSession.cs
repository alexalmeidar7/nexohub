using System.Net;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Owns the authenticated connection state for one House Mix Desktop station.
/// A session becomes connected only after the server confirms the enrolled identity.
/// This class does not enable LAN access or perform automatic credential recovery.
/// </summary>
public sealed class DeviceConnectionSession
{
    private readonly IDeviceIdentityProvider _identityClient;
    private readonly DeviceConnectionRetryOptions _retryOptions;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private DeviceIdentity? _identity;
    private DeviceConnectionState _state = DeviceConnectionState.Disconnected;
    private bool _disposed;

    public DeviceConnectionSession(
        IDeviceIdentityProvider identityClient,
        DeviceConnectionRetryOptions? retryOptions = null)
    {
        _identityClient = identityClient ?? throw new ArgumentNullException(nameof(identityClient));
        _retryOptions = retryOptions ?? DeviceConnectionRetryOptions.Default;
        _retryOptions.Validate();
    }

    public DeviceConnectionState State => _state;
    public DeviceIdentity? Identity => _identity;
    public bool IsConnected => _state == DeviceConnectionState.Connected && _identity is not null;

    public async Task<DeviceIdentity> ConnectAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            _state = DeviceConnectionState.Connecting;
            _identity = null;

            try
            {
                for (var attempt = 1; ; attempt++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    try
                    {
                        var verifiedIdentity = await _identityClient
                            .GetCurrentAsync(cancellationToken).ConfigureAwait(false);

                        _identity = verifiedIdentity;
                        _state = DeviceConnectionState.Connected;
                        return verifiedIdentity;
                    }
                    catch (HttpRequestException exception)
                        when (attempt < _retryOptions.MaxAttempts && IsTransient(exception))
                    {
                        var delay = GetRetryDelay(attempt);
                        await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                _identity = null;
                _state = DeviceConnectionState.Disconnected;
                throw;
            }
            catch
            {
                _identity = null;
                _state = DeviceConnectionState.Faulted;
                throw;
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Clears the in-memory authenticated session. It does not delete the
    /// protected enrollment or revoke the device on the server.
    /// </summary>
    public async Task DisconnectAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            _identity = null;
            _state = DeviceConnectionState.Disconnected;
        }
        finally
        {
            _gate.Release();
        }
    }

    public void EnsureConnected()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (!IsConnected)
            throw new InvalidOperationException("The House Mix Desktop station has no verified authenticated connection.");
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            _identity = null;
            _state = DeviceConnectionState.Disconnected;
            _disposed = true;
        }
        finally
        {
            _gate.Release();
            _gate.Dispose();
        }
    }

    private static bool IsTransient(HttpRequestException exception)
    {
        // A missing status normally means a transport-level failure (for example,
        // connection refused or a dropped connection). Retry only transient HTTP
        // responses; authentication/authorization and other 4xx errors fail fast.
        return exception.StatusCode is null
            or HttpStatusCode.RequestTimeout
            or HttpStatusCode.TooManyRequests
            || (int?)exception.StatusCode >= 500;
    }

    private TimeSpan GetRetryDelay(int failedAttempt)
    {
        var exponentialMs = _retryOptions.InitialDelay.TotalMilliseconds
            * Math.Pow(2, failedAttempt - 1);
        var cappedMs = Math.Min(exponentialMs, _retryOptions.MaxDelay.TotalMilliseconds);
        var jitteredMs = cappedMs * (0.8 + (Random.Shared.NextDouble() * 0.4));
        return TimeSpan.FromMilliseconds(jitteredMs);
    }
}

/// <summary>
/// Bounded retry settings. MaxAttempts includes the first request.
/// </summary>
public sealed record DeviceConnectionRetryOptions(
    int MaxAttempts,
    TimeSpan InitialDelay,
    TimeSpan MaxDelay)
{
    public static DeviceConnectionRetryOptions Default { get; } =
        new(3, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(8));

    public void Validate()
    {
        if (MaxAttempts is < 1 or > 5)
            throw new ArgumentOutOfRangeException(nameof(MaxAttempts), "MaxAttempts must be between 1 and 5.");
        if (InitialDelay <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(InitialDelay), "InitialDelay must be positive.");
        if (MaxDelay < InitialDelay)
            throw new ArgumentOutOfRangeException(nameof(MaxDelay), "MaxDelay cannot be smaller than InitialDelay.");
        if (MaxDelay > TimeSpan.FromSeconds(30))
            throw new ArgumentOutOfRangeException(nameof(MaxDelay), "MaxDelay cannot exceed 30 seconds.");
    }
}

public enum DeviceConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    Faulted
}
