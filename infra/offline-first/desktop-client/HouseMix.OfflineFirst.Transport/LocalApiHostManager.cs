using System.Diagnostics;
using System.Net;
using System.Net.Http;

namespace HouseMix.OfflineFirst.Transport;

/// <summary>
/// Starts and supervises the House Mix local API as a child process.
/// The caller supplies the local PostgreSQL connection string; it is passed only
/// through the child process environment and is never included in diagnostics.
/// The default is loopback; explicit LAN configuration is validated by the API.
/// </summary>
public sealed class LocalApiHostManager : IAsyncDisposable
{
    private readonly LocalApiHostOptions _options;
    private readonly HttpClient _healthClient;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private Process? _process;
    private bool _disposed;

    public LocalApiHostManager(LocalApiHostOptions options)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _options.Validate();
        _healthClient = new HttpClient(new HttpClientHandler
        {
            AllowAutoRedirect = false,
            UseProxy = false
        })
        {
            Timeout = TimeSpan.FromSeconds(2)
        };
    }

    public bool IsRunning => _process is { HasExited: false };

    public async Task StartAsync(CancellationToken cancellationToken = default)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        await _gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (IsRunning)
                throw new InvalidOperationException("The House Mix local API host is already running.");

            if (!File.Exists(_options.NodeExecutablePath))
                throw new FileNotFoundException("The configured Node.js runtime was not found.", _options.NodeExecutablePath);
            if (!File.Exists(_options.ServerScriptPath))
                throw new FileNotFoundException("The House Mix local API entry point was not found.", _options.ServerScriptPath);
            if (!Directory.Exists(_options.WorkingDirectory))
                throw new DirectoryNotFoundException("The House Mix local API working directory was not found.");

            var startInfo = new ProcessStartInfo
            {
                FileName = _options.NodeExecutablePath,
                WorkingDirectory = _options.WorkingDirectory,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            startInfo.ArgumentList.Add(_options.ServerScriptPath);
            startInfo.Environment["DATABASE_URL"] = _options.DatabaseUrl;
            // Explicit opt-in only. The Node API independently validates the private
            // address, authorized subnet and TLS certificate before listening.
            var lanEnabled = Environment.GetEnvironmentVariable("HOUSEMIX_ALLOW_LAN") == "true";
            startInfo.Environment["HOUSEMIX_API_HOST"] = lanEnabled
                ? Environment.GetEnvironmentVariable("HOUSEMIX_API_HOST") ?? "127.0.0.1"
                : "127.0.0.1";
            startInfo.Environment["HOUSEMIX_API_PORT"] = _options.Port.ToString(
                System.Globalization.CultureInfo.InvariantCulture);
            if (!lanEnabled)
            {
                startInfo.Environment.Remove("HOUSEMIX_ALLOW_LAN");
                startInfo.Environment.Remove("HOUSEMIX_LAN_SUBNET");
                startInfo.Environment.Remove("HOUSEMIX_API_TLS");
            }

            var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
            if (!process.Start())
            {
                process.Dispose();
                throw new InvalidOperationException("The House Mix local API process could not be started.");
            }

            _process = process;
            // Drain both pipes to avoid a child process blocking when its output buffers fill.
            _ = process.StandardOutput.ReadToEndAsync();
            _ = process.StandardError.ReadToEndAsync();

            var healthUri = new Uri($"http://127.0.0.1:{_options.Port}/health");
            var deadline = DateTimeOffset.UtcNow + _options.EffectiveStartupTimeout;
            while (DateTimeOffset.UtcNow < deadline)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (process.HasExited)
                    throw new InvalidOperationException(
                        $"The House Mix local API exited during startup (exit code {process.ExitCode}).");

                try
                {
                    using var response = await _healthClient.GetAsync(
                        healthUri, cancellationToken).ConfigureAwait(false);
                    if (response.StatusCode == HttpStatusCode.OK)
                        return;
                }
                catch (HttpRequestException)
                {
                    // The loopback listener may not be ready yet.
                }
                catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
                {
                    // A single health probe timed out; continue within the bounded startup window.
                }

                await Task.Delay(TimeSpan.FromMilliseconds(250), cancellationToken).ConfigureAwait(false);
            }

            throw new TimeoutException("The House Mix local API did not become healthy before the startup timeout.");
        }
        catch
        {
            StopChildProcess();
            throw;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        await _gate.WaitAsync().ConfigureAwait(false);
        try
        {
            if (_disposed) return;
            _disposed = true;
            StopChildProcess();
            _healthClient.Dispose();
        }
        finally
        {
            _gate.Release();
            _gate.Dispose();
        }
    }

    private void StopChildProcess()
    {
        var process = _process;
        _process = null;
        if (process is null) return;

        try
        {
            if (!process.HasExited)
                process.Kill(entireProcessTree: true);
            process.WaitForExit(5000);
        }
        catch (InvalidOperationException)
        {
            // The child exited between the state check and the stop request.
        }
        catch (System.ComponentModel.Win32Exception)
        {
            // The operating system has already terminated or detached the child.
        }
        finally
        {
            process.Dispose();
        }
    }
}

public sealed record LocalApiHostOptions(
    string NodeExecutablePath,
    string ServerScriptPath,
    string WorkingDirectory,
    string DatabaseUrl,
    int Port = 8787,
    TimeSpan? StartupTimeout = null)
{
    public TimeSpan EffectiveStartupTimeout => StartupTimeout ?? TimeSpan.FromSeconds(20);

    public void Validate()
    {
        if (string.IsNullOrWhiteSpace(NodeExecutablePath) || !Path.IsPathFullyQualified(NodeExecutablePath))
            throw new ArgumentException("Node.js executable path must be absolute.", nameof(NodeExecutablePath));
        if (string.IsNullOrWhiteSpace(ServerScriptPath) || !Path.IsPathFullyQualified(ServerScriptPath))
            throw new ArgumentException("API server script path must be absolute.", nameof(ServerScriptPath));
        if (string.IsNullOrWhiteSpace(WorkingDirectory) || !Path.IsPathFullyQualified(WorkingDirectory))
            throw new ArgumentException("API working directory must be absolute.", nameof(WorkingDirectory));
        if (!Uri.TryCreate(DatabaseUrl, UriKind.Absolute, out var databaseUri) ||
            (databaseUri.Scheme is not ("postgres" or "postgresql")) ||
            string.IsNullOrWhiteSpace(databaseUri.Host))
            throw new ArgumentException("A valid PostgreSQL connection URL is required.", nameof(DatabaseUrl));
        if (Port is < 1024 or > 65535)
            throw new ArgumentOutOfRangeException(nameof(Port), "The local API port must be between 1024 and 65535.");
        if (EffectiveStartupTimeout < TimeSpan.FromSeconds(2) ||
            EffectiveStartupTimeout > TimeSpan.FromMinutes(1))
            throw new ArgumentOutOfRangeException(nameof(StartupTimeout),
                "Startup timeout must be between 2 and 60 seconds.");
    }
}
