using System.Security.Cryptography;
using HouseMix.OfflineFirst.Transport;

namespace HouseMix.OfflineFirst.Host;

internal static class Program
{
    private static async Task<int> Main()
    {
        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("HOUSEMIX_LOCAL_API_START_FAILED:windows_required");
            return 1;
        }

        using var shutdown = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            shutdown.Cancel();
        };
        _ = Task.Run(async () =>
        {
            while (await Console.In.ReadLineAsync().ConfigureAwait(false) is { } command)
            {
                if (command == "STOP")
                {
                    shutdown.Cancel();
                    return;
                }
            }
        });

        try
        {
            var nodePath = RequiredPath("HOUSEMIX_LOCAL_API_NODE_PATH");
            var serverPath = RequiredPath("HOUSEMIX_LOCAL_API_SCRIPT_PATH");
            var workingDirectory = RequiredPath("HOUSEMIX_LOCAL_API_WORKING_DIRECTORY");
            var portText = Environment.GetEnvironmentVariable("HOUSEMIX_LOCAL_API_PORT");
            var port = string.IsNullOrWhiteSpace(portText)
                ? 8787
                : int.Parse(portText, System.Globalization.CultureInfo.InvariantCulture);

            // The database URL is never accepted from environment variables or command-line arguments.
            var credentialStore = new LocalDatabaseCredentialStore();
            var databaseUrl = await credentialStore.LoadAsync(shutdown.Token).ConfigureAwait(false);
            if (string.IsNullOrWhiteSpace(databaseUrl))
                throw new InvalidOperationException("Local database has not been provisioned.");

            var options = new LocalApiHostOptions(nodePath, serverPath, workingDirectory, databaseUrl, port);
            await using var manager = new LocalApiHostManager(options);
            await manager.StartAsync(shutdown.Token).ConfigureAwait(false);

            Console.Out.WriteLine("HOUSEMIX_LOCAL_API_READY");
            Console.Out.Flush();

            try
            {
                await Task.Delay(Timeout.InfiniteTimeSpan, shutdown.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
            {
                // Normal shutdown requested by the Desktop process or Ctrl+C.
            }
            return 0;
        }
        catch (OperationCanceledException) when (shutdown.IsCancellationRequested)
        {
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"HOUSEMIX_LOCAL_API_START_FAILED:{Classify(exception)}");
            return 1;
        }
    }

    private static string RequiredPath(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(value) || !Path.IsPathFullyQualified(value))
            throw new InvalidOperationException($"{name} must be an absolute path.");
        return value;
    }

    private static string Classify(Exception exception) => exception switch
    {
        FileNotFoundException => "runtime_file_missing",
        DirectoryNotFoundException => "runtime_directory_missing",
        TimeoutException => "health_check_timeout",
        CryptographicException => "credential_unavailable",
        ArgumentException => "invalid_configuration",
        InvalidOperationException => "database_not_provisioned",
        _ => "host_startup_error"
    };
}
