using System.Drawing;
using System.Diagnostics;
using System.Drawing.Imaging;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;

namespace NexoHubBridge;

internal static partial class NdiNetworkDiscovery
{
    // One preview per HMD; never decode every discovered source in the background.
    private static readonly SemaphoreSlim PreviewSlot = new(1, 1);

    [StructLayout(LayoutKind.Sequential)]
    private struct ReceiveCreate
    {
        public NdiSource Source;
        public int ColorFormat;
        public int Bandwidth;
        [MarshalAs(UnmanagedType.I1)] public bool AllowFields;
        public IntPtr ReceiverName;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct VideoFrame
    {
        public int Width, Height;
        public uint FourCC;
        public int FrameRateN, FrameRateD;
        public float AspectRatio;
        public int FrameFormat;
        public long Timecode;
        public IntPtr Data;
        public int Stride;
        public IntPtr Metadata;
        public long Timestamp;
    }

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern IntPtr NDIlib_recv_create_v3(ref ReceiveCreate settings);
    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern int NDIlib_recv_capture_v2(IntPtr receiver, ref VideoFrame video, IntPtr audio, IntPtr metadata, uint timeout);
    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern void NDIlib_recv_free_video_v2(IntPtr receiver, ref VideoFrame video);
    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern void NDIlib_recv_destroy(IntPtr receiver);

    private static async Task StreamPreviewAsync(HttpListenerContext context, CancellationToken token)
    {
        var name = context.Request.QueryString["source"];
        var source = DiscoverSources().sources.FirstOrDefault(s => s.name == name);
        if (source is null)
        {
            await WriteJsonAsync(context, 404, new { error = "Fonte NDI indisponível na rede." }, token);
            return;
        }
        if (!await PreviewSlot.WaitAsync(TimeSpan.FromSeconds(2), token))
        {
            await WriteJsonAsync(context, 409, new { error = "Outro preview está ativo. Feche-o e tente novamente." }, token);
            return;
        }
        IntPtr receiver = IntPtr.Zero;
        var sourceName = Marshal.StringToCoTaskMemUTF8(source.name);
        var sourceAddress = Marshal.StringToCoTaskMemUTF8(source.address);
        try
        {
            var settings = new ReceiveCreate {
                Source = new NdiSource { NdiName = sourceName, UrlAddress = sourceAddress },
                ColorFormat = 0, // BGRX/BGRA
                Bandwidth = 0, // NDIlib_recv_bandwidth_lowest (preview)
                AllowFields = false
            };
            receiver = NDIlib_recv_create_v3(ref settings);
            if (receiver == IntPtr.Zero) throw new InvalidOperationException("Não foi possível abrir a fonte NDI.");
            context.Response.ContentType = "multipart/x-mixed-replace; boundary=ndi-frame";
            context.Response.SendChunked = true;
            var lastFrame = DateTime.UtcNow;
            var clock = Stopwatch.StartNew();
            var nextFrameMs = 0d;
            const double frameIntervalMs = 1000d / 20;
            var jpegCodec = ImageCodecInfo.GetImageEncoders().First(codec => codec.FormatID == ImageFormat.Jpeg.Guid);
            using var jpegParameters = new EncoderParameters(1);
            jpegParameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, 65L);
            while (!token.IsCancellationRequested)
            {
                var frame = new VideoFrame();
                var kind = NDIlib_recv_capture_v2(receiver, ref frame, IntPtr.Zero, IntPtr.Zero, 500);
                if (kind == 4) break; // disconnected/error
                if (kind != 1)
                {
                    if (DateTime.UtcNow - lastFrame > TimeSpan.FromSeconds(10)) break;
                    continue;
                }
                lastFrame = DateTime.UtcNow;
                // Consume the source continuously; sleeping here queues old frames and adds latency.
                if (clock.Elapsed.TotalMilliseconds < nextFrameMs)
                {
                    NDIlib_recv_free_video_v2(receiver, ref frame);
                    continue;
                }
                // When the renderer was slow, keep only the newest available picture.
                for (var queued = 0; queued < 8; queued++)
                {
                    var newer = new VideoFrame();
                    if (NDIlib_recv_capture_v2(receiver, ref newer, IntPtr.Zero, IntPtr.Zero, 0) != 1) break;
                    NDIlib_recv_free_video_v2(receiver, ref frame);
                    frame = newer;
                }
                byte[] jpeg;
                try
                {
                    // The native buffer must stay alive until encoding has completed.
                    if (frame.Data == IntPtr.Zero || frame.Width <= 0 || frame.Height <= 0 || frame.Stride < frame.Width * 4) continue;
                    using var bitmap = new Bitmap(frame.Width, frame.Height, frame.Stride, PixelFormat.Format32bppRgb, frame.Data);
                    var width = Math.Min(frame.Width, 640);
                    var height = Math.Max(1, (int)((long)frame.Height * width / frame.Width));
                    using var thumbnail = new Bitmap(width, height);
                    using (var graphics = Graphics.FromImage(thumbnail)) graphics.DrawImage(bitmap, 0, 0, width, height);
                    using var memory = new MemoryStream();
                    thumbnail.Save(memory, jpegCodec, jpegParameters);
                    jpeg = memory.ToArray();
                }
                finally { NDIlib_recv_free_video_v2(receiver, ref frame); }
                var header = Encoding.ASCII.GetBytes($"--ndi-frame\r\nContent-Type: image/jpeg\r\nContent-Length: {jpeg.Length}\r\n\r\n");
                await context.Response.OutputStream.WriteAsync(header, token);
                await context.Response.OutputStream.WriteAsync(jpeg, token);
                await context.Response.OutputStream.WriteAsync("\r\n"u8.ToArray(), token);
                await context.Response.OutputStream.FlushAsync(token);
                var nowMs = clock.Elapsed.TotalMilliseconds;
                nextFrameMs += frameIntervalMs;
                if (nextFrameMs < nowMs) nextFrameMs = nowMs; // no burst of catch-up frames
            }
        }
        catch (HttpListenerException) { /* viewer disconnected */ }
        catch (IOException) { /* viewer disconnected */ }
        finally
        {
            if (receiver != IntPtr.Zero) NDIlib_recv_destroy(receiver);
            Marshal.FreeCoTaskMem(sourceName);
            Marshal.FreeCoTaskMem(sourceAddress);
            PreviewSlot.Release();
        }
    }
}
