using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;

namespace NexoHubBridge;

internal static partial class NdiNetworkDiscovery
{
    private static readonly SemaphoreSlim AudioSlot = new(1, 1);
    [StructLayout(LayoutKind.Sequential)]
    private struct AudioFrame
    {
        public int SampleRate, Channels, Samples;
        public long Timecode;
        public IntPtr Data;
        public int ChannelStride;
        public IntPtr Metadata;
        public long Timestamp;
    }
    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl, EntryPoint = "NDIlib_recv_capture_v2")]
    private static extern int CaptureAudio(IntPtr receiver, IntPtr video, ref AudioFrame audio, IntPtr metadata, uint timeout);
    [DllImport(NdiLibrary, CallingConvention = CallingConvention.Cdecl)]
    private static extern void NDIlib_recv_free_audio_v2(IntPtr receiver, ref AudioFrame audio);

    private static async Task StreamAudioAsync(HttpListenerContext context, CancellationToken token)
    {
        var source = DiscoverSources().sources.FirstOrDefault(s => s.name == context.Request.QueryString["source"]);
        if (!context.Request.IsWebSocketRequest || source is null)
        {
            await WriteJsonAsync(context, 400, new { error = "Selecione uma fonte NDI de áudio disponível." }, token);
            return;
        }
        if (!await AudioSlot.WaitAsync(TimeSpan.FromSeconds(2), token))
        {
            await WriteJsonAsync(context, 409, new { error = "Outro retorno de áudio está ativo." }, token);
            return;
        }
        var name = Marshal.StringToCoTaskMemUTF8(source.name);
        var address = Marshal.StringToCoTaskMemUTF8(source.address);
        IntPtr receiver = IntPtr.Zero;
        try
        {
            var settings = new ReceiveCreate { Source = new NdiSource { NdiName = name, UrlAddress = address }, Bandwidth = 10, ColorFormat = 0 };
            receiver = NDIlib_recv_create_v3(ref settings);
            if (receiver == IntPtr.Zero) throw new InvalidOperationException("Não foi possível receber o áudio NDI.");
            var upgrade = await context.AcceptWebSocketAsync(null);
            using var socket = upgrade.WebSocket;
            using var disconnected = CancellationTokenSource.CreateLinkedTokenSource(token);
            // Read closure as well as writing: a silent/disconnected source must not hold the receiver forever.
            var watchClose = Task.Run(async () => {
                try { await socket.ReceiveAsync(new ArraySegment<byte>(new byte[64]), disconnected.Token); }
                catch (WebSocketException) { }
                catch (OperationCanceledException) { }
                finally { disconnected.Cancel(); }
            });
            try
            {
                var lastAudio = DateTime.UtcNow;
                while (!disconnected.IsCancellationRequested && socket.State == WebSocketState.Open)
                {
                    var frame = new AudioFrame();
                    var kind = CaptureAudio(receiver, IntPtr.Zero, ref frame, IntPtr.Zero, 250);
                    if (kind == 4) break;
                    if (kind != 2) { if (DateTime.UtcNow - lastAudio > TimeSpan.FromSeconds(10)) break; continue; }
                    lastAudio = DateTime.UtcNow;
                    byte[] packet;
                    try
                    {
                        if (frame.Data == IntPtr.Zero || frame.Samples <= 0 || frame.Samples > 19200 || frame.Channels <= 0 || (frame.Channels > 1 && frame.ChannelStride < frame.Samples * 4) || frame.SampleRate < 8000 || frame.SampleRate > 192000) continue;
                        var channels = Math.Min(frame.Channels, 2);
                        packet = new byte[8 + frame.Samples * channels * 4];
                        BitConverter.TryWriteBytes(packet.AsSpan(0, 4), frame.SampleRate);
                        BitConverter.TryWriteBytes(packet.AsSpan(4, 2), (ushort)channels);
                        BitConverter.TryWriteBytes(packet.AsSpan(6, 2), (ushort)frame.Samples);
                        var samples = new float[frame.Samples];
                        for (var channel = 0; channel < channels; channel++)
                        {
                            Marshal.Copy(IntPtr.Add(frame.Data, channel * frame.ChannelStride), samples, 0, frame.Samples);
                            for (var i = 0; i < samples.Length; i++) BitConverter.TryWriteBytes(packet.AsSpan(8 + (i * channels + channel) * 4, 4), samples[i]);
                        }
                    }
                    finally { NDIlib_recv_free_audio_v2(receiver, ref frame); }
                    await socket.SendAsync(new ArraySegment<byte>(packet), WebSocketMessageType.Binary, true, disconnected.Token);
                }
            }
            finally { disconnected.Cancel(); socket.Abort(); await watchClose; }
        }
        catch (WebSocketException) { }
        catch (OperationCanceledException) { }
        finally
        {
            if (receiver != IntPtr.Zero) NDIlib_recv_destroy(receiver);
            Marshal.FreeCoTaskMem(name);
            Marshal.FreeCoTaskMem(address);
            AudioSlot.Release();
        }
    }
}
