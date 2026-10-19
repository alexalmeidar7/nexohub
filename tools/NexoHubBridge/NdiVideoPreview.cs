using System.Drawing;
using System.Drawing.Imaging;
using System.Net;
using System.Runtime.InteropServices;

namespace NexoHubBridge;

/// <summary>
/// Receives a real NDI source with the official NDI Runtime and exposes its frames as an MJPEG stream
/// for browser previews. This receiver does not depend on the source being loaded into vMix.
/// </summary>
internal static class NdiVideoPreview
{
    private const string NdiLibrary = "Processing.NDI.Lib.x64.dll";
    private const int VideoFrameType = 1;
    private const int BgraColorFormat = 0;
    private const int HighestBandwidth = 100;

    [StructLayout(LayoutKind.Sequential)]
    private struct NdiSource
    {
        public IntPtr NdiName;
        public IntPtr UrlAddress;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RecvCreateV3
    {
        public NdiSource Source;
        public int ColorFormat;
        public int Bandwidth;
        [MarshalAs(UnmanagedType.I1)] public bool AllowVideoFields;
        public IntPtr RecvName;
        public IntPtr Groups;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct VideoFrameV2
    {
        public int Xres;
        public int Yres;
        public uint FourCC;
        public int FrameRateN;
        public int FrameRateD;
        public float PictureAspectRatio;
        public int FrameFormatType;
        public long Timecode;
        public IntPtr Data;
        public int LineStrideInBytes;
        public IntPtr Metadata;
        public long Timestamp;
    }

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl, EntryPoint = "NDIlib_recv_create_v3")]
    private static extern IntPtr RecvCreate(ref RecvCreateV3 settings);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl, EntryPoint = "NDIlib_recv_capture_v2")]
    private static extern int RecvCapture(IntPtr receiver, out VideoFrameV2 video, IntPtr audio, IntPtr metadata, uint timeoutMs);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl, EntryPoint = "NDIlib_recv_free_video_v2")]
    private static extern void RecvFreeVideo(IntPtr receiver, ref VideoFrameV2 video);

    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl, EntryPoint = "NDIlib_recv_destroy")]
    private static extern void RecvDestroy(IntPtr receiver);

    public static async Task StreamAsync(HttpListenerContext context, string sourceName, CancellationToken token)
    {
        var name = sourceName.Trim();
        if (name.Length == 0 || name.Length > 512)
        {
            context.Response.StatusCode = 400;
            return;
        }

        IntPtr namePtr = IntPtr.Zero;
        IntPtr receiverNamePtr = IntPtr.Zero;
        IntPtr receiver = IntPtr.Zero;
        try
        {
            namePtr = Marshal.StringToCoTaskMemUTF8(name);
            receiverNamePtr = Marshal.StringToCoTaskMemUTF8("NexoHub House Mix Preview");
            var settings = new RecvCreateV3
            {
                Source = new NdiSource { NdiName = namePtr, UrlAddress = IntPtr.Zero },
                ColorFormat = BgraColorFormat,
                Bandwidth = HighestBandwidth,
                AllowVideoFields = false,
                RecvName = receiverNamePtr,
                Groups = IntPtr.Zero
            };
            receiver = RecvCreate(ref settings);
            if (receiver == IntPtr.Zero)
            {
                await WriteErrorAsync(context, "O NDI Runtime não conseguiu abrir esta fonte.");
                return;
            }

            context.Response.StatusCode = 200;
            context.Response.ContentType = "multipart/x-mixed-replace; boundary=frame";
            context.Response.SendChunked = true;
            context.Response.KeepAlive = true;
            context.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            context.Response.Headers["Pragma"] = "no-cache";
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";

            while (!token.IsCancellationRequested)
            {
                var frameType = RecvCapture(receiver, out var frame, IntPtr.Zero, IntPtr.Zero, 250);
                if (frameType != VideoFrameType)
                    continue;

                try
                {
                    if (frame.Data == IntPtr.Zero || frame.Xres < 1 || frame.Yres < 1 ||
                        frame.Xres > 4096 || frame.Yres > 2160 || frame.LineStrideInBytes < frame.Xres * 4)
                        continue;

                    var jpeg = EncodeJpeg(frame);
                    var header = System.Text.Encoding.ASCII.GetBytes(
                        "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + jpeg.Length + "\r\n\r\n");
                    await context.Response.OutputStream.WriteAsync(header, token);
                    await context.Response.OutputStream.WriteAsync(jpeg, token);
                    await context.Response.OutputStream.WriteAsync("\r\n"u8.ToArray(), token);
                    await context.Response.OutputStream.FlushAsync(token);
                }
                finally
                {
                    RecvFreeVideo(receiver, ref frame);
                }
            }
        }
        finally
        {
            if (receiver != IntPtr.Zero) RecvDestroy(receiver);
            if (namePtr != IntPtr.Zero) Marshal.FreeCoTaskMem(namePtr);
            if (receiverNamePtr != IntPtr.Zero) Marshal.FreeCoTaskMem(receiverNamePtr);
        }
    }

    private static byte[] EncodeJpeg(VideoFrameV2 frame)
    {
        using var bitmap = new Bitmap(frame.Xres, frame.Yres, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, frame.Xres, frame.Yres);
        var locked = bitmap.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        try
        {
            var rowBytes = checked(frame.Xres * 4);
            var row = new byte[rowBytes];
            for (var y = 0; y < frame.Yres; y++)
            {
                Marshal.Copy(IntPtr.Add(frame.Data, checked(y * frame.LineStrideInBytes)), row, 0, rowBytes);
                Marshal.Copy(row, 0, IntPtr.Add(locked.Scan0, checked(y * locked.Stride)), rowBytes);
            }
        }
        finally
        {
            bitmap.UnlockBits(locked);
        }

        using var output = new MemoryStream();
        bitmap.Save(output, ImageFormat.Jpeg);
        return output.ToArray();
    }

    private static async Task WriteErrorAsync(HttpListenerContext context, string message)
    {
        context.Response.StatusCode = 503;
        context.Response.ContentType = "application/json; charset=utf-8";
        var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new { error = message });
        context.Response.ContentLength64 = bytes.Length;
        await context.Response.OutputStream.WriteAsync(bytes);
    }
}
