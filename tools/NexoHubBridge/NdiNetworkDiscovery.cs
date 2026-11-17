using System.Net;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace NexoHubBridge;

internal static partial class NdiNetworkDiscovery
{
    private const string ListenerPrefix = "http://127.0.0.1:8765/";
    private const string NdiLibrary = "Processing.NDI.Lib.x64.dll";
    private static readonly string[] AllowedOrigins =
    [
        // House Mix Desktop uses Electron's secure custom scheme instead of HTTPS.
        "housemix://desktop",
        "https://housemix.nexobrasil.net",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ];

    [StructLayout(LayoutKind.Sequential)]
    private struct FindCreate
    {
        [MarshalAs(UnmanagedType.I1)] public bool ShowLocalSources;
        public IntPtr Groups;
        public IntPtr ExtraIps;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NdiSource
    {
        public IntPtr NdiName;
        public IntPtr UrlAddress;
    }

    static NdiNetworkDiscovery()
    {
        NativeLibrary.SetDllImportResolver(typeof(NdiNetworkDiscovery).Assembly, (name, assembly, searchPath) =>
        {
            if (!string.Equals(name, NdiLibrary, StringComparison.OrdinalIgnoreCase)) return IntPtr.Zero;
            var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, NdiLibrary),
                Path.Combine(Environment.GetEnvironmentVariable("NDI_RUNTIME_DIR_V6") ?? AppContext.BaseDirectory, NdiLibrary),
                Path.Combine(programFiles, "NDI", "NDI 6 Tools", "Runtime", NdiLibrary),
                Path.Combine(programFiles, "NDI", "NDI 6 Runtime", NdiLibrary),
                Path.Combine(programFiles, "NDI", "NDI 5 Runtime", NdiLibrary),
                Path.Combine(programFiles, "NDI", "NDI 6 SDK", "Bin", "x64", NdiLibrary),
                Path.Combine(programFiles, "NDI", "NDI 5 SDK", "Bin", "x64", NdiLibrary),
                Path.Combine(programFilesX86, "NDI", "NDI 6 Runtime", NdiLibrary),
                Path.Combine(programFilesX86, "NDI", "NDI 5 Runtime", NdiLibrary)
            };
            foreach (var candidate in candidates)
                if (File.Exists(candidate)) return NativeLibrary.Load(candidate);
            return IntPtr.Zero;
        });
    }

    private sealed record SourceDto(string name, string address);
    private sealed record SourcesDto(bool available, string provider, string? message, IReadOnlyList<SourceDto> sources);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private static extern bool NDIlib_initialize();

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr NDIlib_find_create_v2(ref FindCreate createSettings);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    [return: MarshalAs(UnmanagedType.I1)]
    private static extern bool NDIlib_find_wait_for_sources(IntPtr finder, uint timeoutMs);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr NDIlib_find_get_current_sources(IntPtr finder, out uint sourceCount);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern void NDIlib_find_destroy(IntPtr finder);

    public static async Task RunAsync(CancellationToken token)
    {
        using var listener = new HttpListener();
        listener.Prefixes.Add(ListenerPrefix);
        listener.Start();
        Console.WriteLine("NDI discovery local disponível em http://127.0.0.1:8765/ndi/sources");

        while (!token.IsCancellationRequested)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync().WaitAsync(token);
            }
            catch (OperationCanceledException) { break; }
            catch (HttpListenerException) when (token.IsCancellationRequested) { break; }

            _ = Task.Run(() => HandleAsync(context, token), CancellationToken.None);
        }

        listener.Stop();
    }

    private static async Task HandleAsync(HttpListenerContext context, CancellationToken token)
    {
        try
        {
            var origin = context.Request.Headers["Origin"];
            if (IsAllowedOrigin(origin) && origin is not null)
                context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Response.Headers["Vary"] = "Origin";
            context.Response.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
            context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
            if (IsAllowedOrigin(origin) && context.Request.Headers["Access-Control-Request-Private-Network"] == "true")
                context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
            context.Response.Headers["Cache-Control"] = "no-store";

            if (context.Request.HttpMethod == "OPTIONS")
            {
                context.Response.StatusCode = 204;
                return;
            }

            if (context.Request.HttpMethod == "GET" && context.Request.Url?.AbsolutePath is "/ndi/preview" or "/ndi/audio")
            {
                if (!IsAllowedOrigin(origin) && context.Request.Headers["Sec-Fetch-Site"] != "same-origin")
                {
                    await WriteJsonAsync(context, 403, new { error = "Origin not allowed" }, token);
                    return;
                }
                if (context.Request.Url.AbsolutePath == "/ndi/audio") await StreamAudioAsync(context, token);
                else await StreamPreviewAsync(context, token);
                return;
            }

            if (context.Request.HttpMethod != "GET" ||
                !string.Equals(context.Request.Url?.AbsolutePath, "/ndi/sources", StringComparison.OrdinalIgnoreCase))
            {
                await WriteJsonAsync(context, 404, new { error = "Endpoint not found" }, token);
                return;
            }

            var result = DiscoverSources();
            await WriteJsonAsync(context, result.available ? 200 : 503, result, token);
        }
        catch (Exception ex)
        {
            try { await WriteJsonAsync(context, 500, new { available = false, message = ex.Message, sources = Array.Empty<object>() }, token); }
            catch { /* client disconnected */ }
        }
        finally
        {
            context.Response.Close();
        }
    }

    private static bool IsAllowedOrigin(string? origin)
    {
        if (string.IsNullOrWhiteSpace(origin)) return false;
        if (AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return false;
        return uri.Host.EndsWith(".lovable.app", StringComparison.OrdinalIgnoreCase)
            || uri.Host.EndsWith(".lovable.dev", StringComparison.OrdinalIgnoreCase);
    }

    private static readonly object DiscoveryLock = new();
    private static IntPtr persistentFinder;

    private static SourcesDto DiscoverSources()
    {
        lock (DiscoveryLock) return DiscoverSourcesLocked();
    }

    private static SourcesDto DiscoverSourcesLocked()
    {
        try
        {
            if (!NDIlib_initialize())
                return new SourcesDto(false, "NDI Runtime", "O NDI Runtime não conseguiu inicializar neste computador.", Array.Empty<SourceDto>());

            var settings = new FindCreate { ShowLocalSources = true, Groups = IntPtr.Zero, ExtraIps = IntPtr.Zero };
            var firstScan = persistentFinder == IntPtr.Zero;
            var finder = persistentFinder;
            if (firstScan) persistentFinder = finder = NDIlib_find_create_v2(ref settings);
            if (finder == IntPtr.Zero)
                return new SourcesDto(false, "NDI Runtime", "Não foi possível iniciar a descoberta NDI.", Array.Empty<SourceDto>());

            try
            {
                _ = NDIlib_find_wait_for_sources(finder, firstScan ? 1200u : 0u);
                var ptr = NDIlib_find_get_current_sources(finder, out var count);
                var sources = new List<SourceDto>();
                var stride = Marshal.SizeOf<NdiSource>();
                for (var i = 0; i < Math.Min(count, 512); i++)
                {
                    var item = Marshal.PtrToStructure<NdiSource>(IntPtr.Add(ptr, checked((int)i * stride)));
                    var name = Marshal.PtrToStringUTF8(item.NdiName)?.Trim();
                    var address = Marshal.PtrToStringUTF8(item.UrlAddress)?.Trim() ?? "";
                    if (!string.IsNullOrWhiteSpace(name))
                        sources.Add(new SourceDto(name, address));
                }

                return new SourcesDto(true, "NDI Runtime", null,
                    sources.DistinctBy(s => s.name, StringComparer.OrdinalIgnoreCase)
                           .OrderBy(s => s.name, StringComparer.OrdinalIgnoreCase).ToArray());
            }
            finally { /* Keep discovery alive so slow/new sources appear on later scans. */ }
        }
        catch (DllNotFoundException)
        {
            return new SourcesDto(false, "NDI Runtime", "Componente NDI indisponível. Repare a instalação do House Mix Desktop.", Array.Empty<SourceDto>());
        }
        catch (EntryPointNotFoundException)
        {
            return new SourcesDto(false, "NDI Runtime", "A versão instalada do NDI Runtime não oferece a API de descoberta esperada. Atualize o NDI Runtime.", Array.Empty<SourceDto>());
        }
        catch (Exception ex)
        {
            return new SourcesDto(false, "NDI Runtime", $"Falha na descoberta NDI: {ex.Message}", Array.Empty<SourceDto>());
        }
    }

    private static async Task WriteJsonAsync(HttpListenerContext context, int status, object value, CancellationToken token)
    {
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/json; charset=utf-8";
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        context.Response.ContentLength64 = bytes.Length;
        await context.Response.OutputStream.WriteAsync(bytes, token);
    }
}
