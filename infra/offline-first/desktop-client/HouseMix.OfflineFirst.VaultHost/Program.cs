using System.Text.Json;
using HouseMix.OfflineFirst.Transport;

if (!OperatingSystem.IsWindows())
{
    Console.Error.WriteLine("DPAPI vault host requires Windows.");
    return 10;
}

var tenantId = Environment.GetEnvironmentVariable("HOUSEMIX_AUTHENTICATED_TENANT_ID");
var credentialsRoot = Environment.GetEnvironmentVariable("HOUSEMIX_TENANT_CREDENTIALS_ROOT");
if (!Guid.TryParse(tenantId, out var parsedTenantId) || parsedTenantId == Guid.Empty ||
    string.IsNullOrWhiteSpace(credentialsRoot))
{
    Console.Error.WriteLine("Required authenticated tenant context is unavailable.");
    return 11;
}

try
{
    var canonicalTenantId = parsedTenantId.ToString("D");
    var tenantDirectory = Path.GetFullPath(Path.Combine(credentialsRoot, canonicalTenantId, "credentials"));
    var canonicalRoot = Path.GetFullPath(credentialsRoot) + Path.DirectorySeparatorChar;
    if (!tenantDirectory.StartsWith(canonicalRoot, StringComparison.OrdinalIgnoreCase))
        throw new InvalidOperationException("Tenant credential path is outside the configured root.");

    var vault = new DpapiTenantRuntimeSecretVault(_ => tenantDirectory);
    var secret = await vault.GetTenantRuntimeSecretAsync(canonicalTenantId);
    var output = JsonSerializer.Serialize(new { secret });
    await Console.Out.WriteAsync(output);
    await Console.Out.FlushAsync();
    return 0;
}
catch (FileNotFoundException)
{
    await Console.Out.WriteAsync("{\"secret\":null}");
    await Console.Out.FlushAsync();
    return 0;
}
catch (Exception)
{
    Console.Error.WriteLine("Protected tenant credential lookup failed.");
    return 12;
}
