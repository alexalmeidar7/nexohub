using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;\nusing System.Diagnostics;

namespace NexoHubBridge;
internal sealed class BridgeConfig {
 public string SupabaseUrl {get;set;}="https://zzjfzxxvxbspbdkodoix.supabase.co";
 public string PairingCode {get;set;}=""; public string BridgeToken {get;set;}="";
 public string VmixUrl {get;set;}="http://127.0.0.1:8088"; public string VmixUsername {get;set;}="";
 public string VmixPassword {get;set;}=""; public string DeviceName {get;set;}=Environment.MachineName; public int PollIntervalMs {get;set;}=1000;
}
internal sealed record BridgeJob(string Id,string Path,string Method,JsonElement? Body);
internal sealed record PollResponse(BridgeJob? Job);
internal sealed record PairResponse(string Token);
internal sealed record BridgeUpdateManifest(string Version,string DownloadUrl);

internal static class Program {
 static readonly JsonSerializerOptions JsonOptions=new(){PropertyNameCaseInsensitive=true};
 static readonly string ConfigPath=Path.Combine(AppContext.BaseDirectory,"appsettings.json");\n static readonly Version CurrentVersion=typeof(Program).Assembly.GetName().Version ?? new Version(1,0,0);\n static readonly Uri UpdateManifestUri=new("https://housemix.nexobrasil.net/downloads/nexohub-bridge/latest.json");
 public static async Task<int> Main() {
  Console.Title="NexoHub Bridge"; Console.WriteLine($"NexoHub Bridge v{CurrentVersion} - conector local do vMix e descoberta NDI");\n  await CheckForUpdatesAsync();
  using var stop=new CancellationTokenSource();
  Console.CancelKeyPress+=(_,e)=>{e.Cancel=true;stop.Cancel();};
  _ = Task.Run(async () => {
   try { await NdiNetworkDiscovery.RunAsync(stop.Token); }
   catch (Exception ex) { Console.Error.WriteLine($"Serviço de descoberta NDI indisponível: {ex.Message}"); }
  }, CancellationToken.None);

  BridgeConfig c;
  try { c=await LoadConfigAsync(); Validate(c); }
  catch(Exception ex) {
   Console.Error.WriteLine($"Configuração do relay remoto: {ex.Message}");
   Console.WriteLine("A descoberta NDI local continua ativa. Pressione Ctrl+C para encerrar.");
   try { await Task.Delay(Timeout.Infinite, stop.Token); } catch (OperationCanceledException) { }
   return 0;
  }

  using var cloud=new HttpClient{Timeout=TimeSpan.FromSeconds(15)};
  using var vmix=new HttpClient{Timeout=TimeSpan.FromSeconds(8)};
  cloud.DefaultRequestHeaders.UserAgent.ParseAdd("NexoHubBridge/0.2");
  if(!string.IsNullOrWhiteSpace(c.VmixUsername)) vmix.DefaultRequestHeaders.Authorization=new AuthenticationHeaderValue("Basic",Convert.ToBase64String(Encoding.UTF8.GetBytes($"{c.VmixUsername}:{c.VmixPassword}")));
  if(string.IsNullOrWhiteSpace(c.BridgeToken)) {
   try { c.BridgeToken=await PairAsync(cloud,c); c.PairingCode=""; await SaveAsync(c); Console.WriteLine("Pareamento concluído; token salvo localmente."); }
   catch(Exception ex) { Console.Error.WriteLine($"Falha no pareamento remoto: {ex.Message}. A descoberta NDI local continua ativa."); }
  }
  Console.WriteLine($"Estúdio: {c.DeviceName} | vMix: {c.VmixUrl}");
  Console.WriteLine("Relay de nuvem ativo quando pareado. Ctrl+C encerra.");
  int failures=0;
  while(!stop.IsCancellationRequested && !string.IsNullOrWhiteSpace(c.BridgeToken)) {
   try {
    var poll=await CloudPostAsync<PollResponse>(cloud,c,"vmix-bridge-poll",new{action="poll"},stop.Token); failures=0;
    if(poll?.Job is {} job) {
     var result=await ExecuteJobAsync(vmix,c,job,stop.Token);
     await CloudPostAsync<JsonElement>(cloud,c,"vmix-bridge-result",new{jobId=job.Id,success=result.Success,statusCode=result.Status,body=result.Body},stop.Token);
    } else await Task.Delay(Math.Clamp(c.PollIntervalMs,750,5000),stop.Token);
   } catch(OperationCanceledException) when(stop.IsCancellationRequested) { break; }
   catch(Exception ex) { failures++; if(failures==1||failures%10==0) Console.WriteLine($"Conexão indisponível ({failures}): {ex.Message}. Tentando novamente."); await Task.Delay(Math.Min(1000*Math.Min(failures,10),10000),stop.Token); }
  }
  try { await Task.Delay(Timeout.Infinite, stop.Token); } catch (OperationCanceledException) { }
  return 0;
 }

 static async Task CheckForUpdatesAsync() {
  try {
   using var http=new HttpClient{Timeout=TimeSpan.FromSeconds(8)};
   http.DefaultRequestHeaders.UserAgent.ParseAdd("NexoHubBridge-Updater");
   var manifest=await http.GetFromJsonAsync<BridgeUpdateManifest>(UpdateManifestUri);
   if(manifest is null||!Version.TryParse(manifest.Version,out var latest)||latest<=CurrentVersion||!Uri.TryCreate(manifest.DownloadUrl,UriKind.Absolute,out var download)||download.Scheme!="https")return;
   Console.WriteLine($"Nova versão disponível: {latest}. Baixando atualização...");
   var tempExe=Path.Combine(Path.GetTempPath(),$"NexoHubBridge-{Guid.NewGuid():N}.exe");
   await using(var stream=await http.GetStreamAsync(download)) await using(var output=File.Create(tempExe)) await stream.CopyToAsync(output);
   var currentExe=Environment.ProcessPath;
   if(string.IsNullOrWhiteSpace(currentExe)||!File.Exists(currentExe)){File.Delete(tempExe);return;}
   var script=Path.Combine(Path.GetTempPath(),$"NexoHubBridge-update-{Guid.NewGuid():N}.cmd");
   var content=$"@echo off\r\ntimeout /t 2 /nobreak >nul\r\ncopy /Y \"{tempExe}\" \"{currentExe}\" >nul\r\nif errorlevel 1 exit /b 1\r\nstart \"\" \"{currentExe}\"\r\ndel \"{tempExe}\"\r\ndel \"%~f0\"\r\n";
   await File.WriteAllTextAsync(script,content,Encoding.Default);
   Process.Start(new ProcessStartInfo("cmd.exe",$"/c \"{script}\""){UseShellExecute=false,CreateNoWindow=true});
   Environment.Exit(0);
  } catch(Exception ex) { Console.WriteLine($"Atualização automática indisponível; mantendo v{CurrentVersion}: {ex.Message}"); }
 }
\n static async Task<BridgeConfig> LoadConfigAsync() {
  if(!File.Exists(ConfigPath)){await SaveAsync(new BridgeConfig());throw new InvalidOperationException("Criei appsettings.json. Edite PairingCode com o código gerado pelo NexoHub e execute novamente.");}
  return JsonSerializer.Deserialize<BridgeConfig>(await File.ReadAllTextAsync(ConfigPath),JsonOptions)??new BridgeConfig();
 }
 static Task SaveAsync(BridgeConfig c)=>File.WriteAllTextAsync(ConfigPath,JsonSerializer.Serialize(c,new JsonSerializerOptions{WriteIndented=true}));
 static void Validate(BridgeConfig c) {
  if(!Uri.TryCreate(c.SupabaseUrl,UriKind.Absolute,out var cloud)||cloud.Scheme!="https")throw new InvalidOperationException("SupabaseUrl deve usar HTTPS.");
  if(!Uri.TryCreate(c.VmixUrl,UriKind.Absolute,out var local)||!(local.Scheme=="http"||local.Scheme=="https"))throw new InvalidOperationException("VmixUrl inválida.");
  if(string.IsNullOrWhiteSpace(c.BridgeToken)&&string.IsNullOrWhiteSpace(c.PairingCode))throw new InvalidOperationException("PairingCode não informado.");
 }
 static async Task<string> PairAsync(HttpClient client,BridgeConfig c) {
  using var r=await client.PostAsJsonAsync(c.SupabaseUrl.TrimEnd('/')+"/functions/v1/vmix-bridge-connect",new{pairingCode=c.PairingCode,deviceName=c.DeviceName});
  var b=await r.Content.ReadAsStringAsync(); if(!r.IsSuccessStatusCode)throw new InvalidOperationException($"HTTP {(int)r.StatusCode}: {Short(b)}");
  return JsonSerializer.Deserialize<PairResponse>(b,JsonOptions)?.Token is {Length:>10} t?t:throw new InvalidOperationException("Token ausente na resposta.");
 }
 static async Task<T?> CloudPostAsync<T>(HttpClient client,BridgeConfig c,string fn,object data,CancellationToken ct) {
  using var req=new HttpRequestMessage(HttpMethod.Post,c.SupabaseUrl.TrimEnd('/')+"/functions/v1/"+fn);
  req.Headers.Authorization=new AuthenticationHeaderValue("Bearer",c.BridgeToken);req.Content=JsonContent.Create(data);
  using var res=await client.SendAsync(req,ct);var body=await res.Content.ReadAsStringAsync(ct);
  if(!res.IsSuccessStatusCode)throw new InvalidOperationException($"{fn} HTTP {(int)res.StatusCode}: {Short(body)}");
  if(typeof(T)==typeof(JsonElement)||string.IsNullOrWhiteSpace(body))return default;return JsonSerializer.Deserialize<T>(body,JsonOptions);
 }
 static async Task<(bool Success,int Status,string Body)> ExecuteJobAsync(HttpClient client,BridgeConfig c,BridgeJob job,CancellationToken ct) {
  if(string.IsNullOrWhiteSpace(job.Path)||!job.Path.StartsWith("/api/",StringComparison.OrdinalIgnoreCase)||job.Path.Contains("://")||job.Path.Contains('\\'))return(false,400,"Rejected: only vMix /api/ paths are allowed.");
  var baseUri=new Uri(c.VmixUrl.TrimEnd('/')+"/");var target=new Uri(baseUri,job.Path.TrimStart('/'));
  if(target.Host!=baseUri.Host||target.Port!=baseUri.Port)return(false,400,"Rejected: destination must be the configured vMix host.");
  using var req=new HttpRequestMessage(job.Method=="POST"?HttpMethod.Post:HttpMethod.Get,target);
  if(job.Body is { } body&&job.Method=="POST")req.Content=new StringContent(body.GetRawText(),Encoding.UTF8,"application/json");
  using var res=await client.SendAsync(req,ct);var content=await res.Content.ReadAsStringAsync(ct);return((int)res.StatusCode is >=200 and <400,(int)res.StatusCode,content.Length>500000?content[..500000]:content);
 }
 static string Short(string s)=>s.Length>500?s[..500]:s;
}
