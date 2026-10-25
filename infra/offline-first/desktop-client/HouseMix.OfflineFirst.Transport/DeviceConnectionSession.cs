namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Owns the authenticated connection state for one House Mix Desktop station.
/// A session becomes connected only after the server confirms the enrolled identity.
/// This class does not enable LAN access or perform automatic credential recovery.
/// </summary>
public sealed class DeviceConnectionSession(DeviceIdentityClient identityClient)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private DeviceIdentity? _identity;
    private DeviceConnectionState _state = DeviceConnectionState.Disconnected;
    private bool _disposed;

    public DeviceConnectionState State => _state;
    public DeviceIdentity? Identity => _identity;
    public bool IsConnected => _state == DeviceConnectionState.Connected && _identity is not null;

    public async Task<DeviceIdentity> ConnectAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        ArgumentNullException.ThrowIfNull(identityClient);

        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            _state = DeviceConnectionState.Connecting;
            _identity = null;

            try
            {
                var verifiedIdentity = await identityClient.GetCurrentAsync(cancellationToken).ConfigureAwait(false);
                _identity = verifiedIdentity;
                _state = DeviceConnectionState.Connected;
                return verifiedIdentity;
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
}

public enum DeviceConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    Faulted
}
