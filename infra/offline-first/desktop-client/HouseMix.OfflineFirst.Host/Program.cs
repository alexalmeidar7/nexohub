using HouseMix.OfflineFirst.Transport;

namespace HouseMix.OfflineFirst.Host;

internal static class Program
{
    private static async Task<int> Main()
    {
        using var shutdown = new CancellationTokenSource();
        Console.CancelKeyPress += (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            shutdown.Cancel();
        };

        try
        {
            var nodePath = RequiredPath("HOUSEMIX_LOCAL_API_NODE_PATH");
            var serverPath = RequiredPath("HOUSEMIX_LOCAL_API_SCRIPT_PATH");
            var workingDirectory = RequiredPath("HOUSEMIX_LOCAL_API_WORKING_DIRECTORY");
            var databaseUrl = Environment.GetEnvironmentVariable("HOUSEMIX_LOCAL_DATABASE_URL");
            if (string.IsNullOrWhiteSpace(databaseUrl))
                throw new InvalidOperationException("Local database configuration is not available.");

            var portText = Environment.GetEnvironmentVariable("HOUSEMIX_LOCAL_API_PORT");
            var port = string.IsNullOrWhiteSpace(portText)
                ? 8787
                : int.Parse(portText, System.Globalization.CultureInfo.InvariantCulture);

            var options = new LocalApiHostOptions(
                nodePath,
                serverPath,
                workingDirectory,
                databaseUrl,
                port);

            await using var manager = new LocalApiHostManager(options);
            await manager.StartAsync(shutdown.Token).ConfigureAwait(false);

            // A single machine-readable readiness signal; never print configuration or secrets.
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
            // Exception messages from process/configuration APIs can contain paths or connection
            // details. Emit only a stable error category; never write exception text to stdout.
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
        ArgumentException => "invalid_configuration",
        _ => "host_startup_error"
    };
}
