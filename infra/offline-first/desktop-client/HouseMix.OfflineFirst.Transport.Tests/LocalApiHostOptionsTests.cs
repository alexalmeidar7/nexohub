using HouseMix.OfflineFirst.Transport;
using Xunit;

namespace HouseMix.OfflineFirst.Transport.Tests;

public sealed class LocalApiHostOptionsTests
{
    private static LocalApiHostOptions ValidOptions() => new(
        @"C:\\Program Files\\nodejs\\node.exe",
        @"C:\\HouseMix\\infra\\offline-first\\api\\server.mjs",
        @"C:\\HouseMix",
        "postgres://housemix_local:secret@127.0.0.1:55432/housemix_local");

    [Fact]
    public void Validate_AcceptsAbsoluteWindowsPathsAndPostgresUrl()
    {
        var options = ValidOptions();

        options.Validate();

        Assert.Equal(TimeSpan.FromSeconds(20), options.EffectiveStartupTimeout);
    }

    [Fact]
    public void Validate_RejectsRelativeRuntimePath()
    {
        var options = ValidOptions() with { NodeExecutablePath = "node.exe" };

        Assert.Throws<ArgumentException>(() => options.Validate());
    }

    [Fact]
    public void Validate_RejectsNonPostgresDatabaseUrl()
    {
        var options = ValidOptions() with { DatabaseUrl = "https://localhost/database" };

        Assert.Throws<ArgumentException>(() => options.Validate());
    }

    [Theory]
    [InlineData(80)]
    [InlineData(65536)]
    public void Validate_RejectsPortsOutsideSafeRange(int port)
    {
        var options = ValidOptions() with { Port = port };

        Assert.Throws<ArgumentOutOfRangeException>(() => options.Validate());
    }

    [Fact]
    public void Validate_RejectsUnboundedStartupTimeout()
    {
        var options = ValidOptions() with { StartupTimeout = TimeSpan.FromMinutes(2) };

        Assert.Throws<ArgumentOutOfRangeException>(() => options.Validate());
    }
}
