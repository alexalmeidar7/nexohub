using System.Net;
using HouseMix.OfflineFirst.Transport;

namespace HouseMix.OfflineFirst.Transport.Tests;

public sealed class DeviceConnectionSessionTests
{
    private static readonly DeviceIdentity Identity =
        new("device-1", "tenant-a", "station", "Studio principal");

    [Fact]
    public async Task ConnectAsync_RetriesTransientServerFailure_ThenConnects()
    {
        var provider = new SequenceIdentityProvider(
            new HttpRequestException("server unavailable", null, HttpStatusCode.ServiceUnavailable),
            Identity);
        await using var session = new DeviceConnectionSession(
            provider,
            new DeviceConnectionRetryOptions(2, TimeSpan.FromMilliseconds(1), TimeSpan.FromMilliseconds(2)));

        var result = await session.ConnectAsync();

        Assert.Equal(Identity, result);
        Assert.Equal(2, provider.Calls);
        Assert.Equal(DeviceConnectionState.Connected, session.State);
        Assert.True(session.IsConnected);
    }

    [Fact]
    public async Task ConnectAsync_DoesNotRetryUnauthorizedFailure()
    {
        var provider = new SequenceIdentityProvider(
            new HttpRequestException("unauthorized", null, HttpStatusCode.Unauthorized));
        await using var session = new DeviceConnectionSession(
            provider,
            new DeviceConnectionRetryOptions(4, TimeSpan.FromMilliseconds(1), TimeSpan.FromMilliseconds(2)));

        await Assert.ThrowsAsync<HttpRequestException>(() => session.ConnectAsync());

        Assert.Equal(1, provider.Calls);
        Assert.Equal(DeviceConnectionState.Faulted, session.State);
        Assert.Null(session.Identity);
    }

    [Fact]
    public async Task ConnectAsync_StopsAfterRetryBudgetIsExhausted()
    {
        var provider = new SequenceIdentityProvider(
            new HttpRequestException("failure"),
            new HttpRequestException("failure"),
            new HttpRequestException("failure"));
        await using var session = new DeviceConnectionSession(
            provider,
            new DeviceConnectionRetryOptions(2, TimeSpan.FromMilliseconds(1), TimeSpan.FromMilliseconds(2)));

        await Assert.ThrowsAsync<HttpRequestException>(() => session.ConnectAsync());

        Assert.Equal(2, provider.Calls);
        Assert.Equal(DeviceConnectionState.Faulted, session.State);
        Assert.False(session.IsConnected);
    }

    [Fact]
    public async Task ConnectAsync_CancellationDuringBackoffReturnsToDisconnected()
    {
        var provider = new SequenceIdentityProvider(
            new HttpRequestException("temporary network failure"));
        await using var session = new DeviceConnectionSession(
            provider,
            new DeviceConnectionRetryOptions(3, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5)));
        using var cancellation = new CancellationTokenSource();

        var connect = session.ConnectAsync(cancellation.Token);
        await provider.FirstCall;
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => connect);

        Assert.Equal(1, provider.Calls);
        Assert.Equal(DeviceConnectionState.Disconnected, session.State);
        Assert.Null(session.Identity);
    }

    [Fact]
    public void Constructor_RejectsUnsafeRetryBounds()
    {
        var provider = new SequenceIdentityProvider(Identity);

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new DeviceConnectionSession(provider,
                new DeviceConnectionRetryOptions(6, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(2))));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new DeviceConnectionSession(provider,
                new DeviceConnectionRetryOptions(2, TimeSpan.FromSeconds(2), TimeSpan.FromSeconds(1))));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            new DeviceConnectionSession(provider,
                new DeviceConnectionRetryOptions(2, TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(31))));
    }

    private sealed class SequenceIdentityProvider(params object[] outcomes) : IDeviceIdentityProvider
    {
        private readonly Queue<object> _outcomes = new(outcomes);
        private readonly TaskCompletionSource _firstCall =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public int Calls { get; private set; }
        public Task FirstCall => _firstCall.Task;

        public Task<DeviceIdentity> GetCurrentAsync(CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Calls++;
            _firstCall.TrySetResult();
            if (_outcomes.Count == 0)
                throw new InvalidOperationException("No more fake outcomes were configured.");

            var outcome = _outcomes.Dequeue();
            if (outcome is Exception exception) throw exception;
            return Task.FromResult((DeviceIdentity)outcome);
        }
    }
}