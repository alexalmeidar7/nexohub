using HouseMix.OfflineFirst.Transport;
using Xunit;

namespace HouseMix.OfflineFirst.Transport.Tests;

public sealed class TenantRuntimeCredentialPolicyTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 25, 12, 0, 0, TimeSpan.Zero);

    private static TenantRuntimeCredential Credential(
        DateTimeOffset createdAt,
        DateTimeOffset? expiresAt) =>
        new(
            "00000000-0000-4000-8000-000000000001",
            "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "hm_app_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            new string('c', 64),
            createdAt,
            expiresAt);

    [Fact]
    public void EnsureUsable_AcceptsCredentialInsideValidityWindow()
    {
        var credential = Credential(Now.AddDays(-1), Now.AddDays(30));

        TenantRuntimeCredentialPolicy.EnsureUsable(credential, Now);
    }

    [Fact]
    public void EnsureUsable_RejectsExpiredCredential()
    {
        var credential = Credential(Now.AddDays(-30), Now);

        var error = Assert.Throws<InvalidOperationException>(
            () => TenantRuntimeCredentialPolicy.EnsureUsable(credential, Now));

        Assert.Equal("tenant_runtime_credential_expired", error.Message);
    }

    [Fact]
    public void EnsureUsable_RejectsExpiryBeforeCreation()
    {
        var credential = Credential(Now.AddDays(-1), Now.AddDays(-2));

        var error = Assert.Throws<InvalidOperationException>(
            () => TenantRuntimeCredentialPolicy.EnsureUsable(credential, Now));

        Assert.Equal("tenant_runtime_credential_expiry_invalid", error.Message);
    }

    [Fact]
    public void EnsureUsable_RejectsCredentialCreatedTooFarInFuture()
    {
        var credential = Credential(Now.AddMinutes(6), Now.AddDays(30));

        var error = Assert.Throws<InvalidOperationException>(
            () => TenantRuntimeCredentialPolicy.EnsureUsable(credential, Now));

        Assert.Equal("tenant_runtime_credential_not_yet_valid", error.Message);
    }

    [Fact]
    public void EnsureUsable_AllowsCredentialWithoutConfiguredExpiry()
    {
        var credential = Credential(Now.AddDays(-1), null);

        TenantRuntimeCredentialPolicy.EnsureUsable(credential, Now);
    }
}
