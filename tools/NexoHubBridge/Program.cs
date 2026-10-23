using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Reflection;
using System.Security.Cryptography;

namespace NexoHubBridge;

internal sealed class BridgeConfig
{
    public string SupabaseUrl { get; set; } = "https://zzjfzxxvxbspbdkodoix.supabase.co";
    public string PairingCode { get; set; } = "";
    public string BridgeToken { get; set; } = "";
    public string VmixUrl { get; set; } = "http://127.0.0.1:8088";
    public string VmixUsername { get; set; } = "";
    public string VmixPassword { get; set; } = "";
    public string DeviceName { get; set; } = Environment.MachineName;
    public int PollIntervalMs { get; set; } = 1000;
}

internal sealed record BridgeJob(string Id, string Path, string Method, JsonElement? Body);
internal sealed record PollResponse(BridgeJob? Job);
internal sealed record PairResponse(string Token);
internal sealed record BridgeUpdateManifest(string Version, string DownloadUrl, string Sha256);

internal static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        using var mutex = new Mutex(true, @"Local\NexoHubBridge.Desktop", out var created);
        if (!created) return;
        ApplicationConfiguration.Initialize();
        Application.Run(new BridgeForm(args.Contains("--background", StringComparer.OrdinalIgnoreCase)));
    }
}

internal sealed class BridgeForm : Form
{
    private static readonly Version CurrentVersion = Assembly.GetExecutingAssembly().GetName().Version ?? new Version(1, 0, 0, 0);
    private static readonly Uri UpdateManifestUri = new("https://housemix.nexobrasil.net/downloads/nexohub-bridge/latest.json");

    private readonly string _configPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NexoBrasil", "NexoHubBridge", "appsettings.json");
    private readonly TextBox _device = new();
    private readonly TextBox _vmixUrl = new();
    private readonly TextBox _pairingCode = new();
    private readonly TextBox _username = new();
    private readonly TextBox _password = new();
    private readonly CheckBox _startup = new();
    private readonly Label _status = new();
    private readonly Label _detail = new();
    private readonly Label _ndiStatus = new();
    private readonly Button _ndiDownload = new();
    private readonly Button _connect = new();
    private readonly Button _save = new();
    private readonly NotifyIcon _tray = new();
    private readonly ContextMenuStrip _trayMenu = new();
    private BridgeConfig _config = new();
    private BridgeService? _service;
    private CancellationTokenSource? _serviceCts;
    private bool _reallyClosing;
    private bool _busy;

    public BridgeForm(bool startHidden)
    {
        Text = $"NexoHub Bridge v{CurrentVersion}";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        MinimumSize = new Size(750, 390);
        Size = new Size(750, 390);
        Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        MaximizeBox = false;
        Font = new Font("Arial", 9F);
        BackColor = Color.FromArgb(246, 248, 251);
        BuildUi();
        BuildTray();
        Load += async (_, _) => await InitializeAsync(startHidden);
        Resize += (_, _) => { if (WindowState == FormWindowState.Minimized) HideToTray(); };
        FormClosing += OnFormClosing;
    }

    private void BuildUi()
    {
        // Explicit positions prevent the body panel from covering the logo.
        var titleBar = new Panel { Location = new Point(0, 0), Size = new Size(750, 36), BackColor = Color.FromArgb(0, 77, 255) };
        var title = new Label { Text = $"Nexo Brasil - Soluções visuais - Nexo Bridge v{CurrentVersion}", ForeColor = Color.White, Font = new Font("Segoe UI", 9F), AutoSize = true, Location = new Point(15, 10), BackColor = Color.Transparent };
        var minimizeWindow = new Button { Text = "—", FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(0, 77, 255), Font = new Font("Segoe UI", 12F), Size = new Size(30, 30), Location = new Point(680, 3), TabStop = false, Cursor = Cursors.Hand };
        minimizeWindow.FlatAppearance.BorderSize = 0; minimizeWindow.Click += (_, _) => HideToTray();
        var closeWindow = new Button { Text = "×", FlatStyle = FlatStyle.Flat, ForeColor = Color.White, BackColor = Color.FromArgb(0, 77, 255), Font = new Font("Segoe UI", 16F), Size = new Size(30, 30), Location = new Point(710, 3), TabStop = false, Cursor = Cursors.Hand };
        closeWindow.FlatAppearance.BorderSize = 0; closeWindow.Click += (_, _) => HideToTray();
        titleBar.Controls.Add(title); titleBar.Controls.Add(minimizeWindow); titleBar.Controls.Add(closeWindow);
        titleBar.MouseDown += DragWindow; title.MouseDown += DragWindow; Controls.Add(titleBar);

        var body = new Panel { Location = new Point(0, 36), Size = new Size(750, 354), BackColor = Color.FromArgb(246, 248, 250) };
        Controls.Add(body);
        var logo = new PictureBox { Location = new Point(20, 17), Size = new Size(235, 45), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.Transparent };
        try
        {
            using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("NexoHubBridge.assets.bridge-logo.png");
            if (stream is not null) { using var source = Image.FromStream(stream); logo.Image = new Bitmap(source); }
        }
        catch { }
        body.Controls.Add(logo);
        body.Controls.Add(new Label { Text = "Conecte o House Mix ao vMix deste computador", Location = new Point(22, 65), AutoSize = true, Font = new Font("Segoe UI", 9F), ForeColor = Color.FromArgb(105, 113, 125) });

        _vmixUrl.Location = new Point(18, 91); _vmixUrl.Size = new Size(356, 37); _vmixUrl.Font = new Font("Segoe UI", 10F);
        _vmixUrl.BorderStyle = BorderStyle.FixedSingle; _vmixUrl.PlaceholderText = "IP DO VMIX (ex.: 192.168.1.50:8088)"; body.Controls.Add(_vmixUrl);

        _connect.Text = "SALVAR E CONECTAR"; _connect.Location = new Point(382, 91); _connect.Size = new Size(174, 37);
        _connect.FlatStyle = FlatStyle.Flat; _connect.FlatAppearance.BorderSize = 0; _connect.BackColor = Color.FromArgb(0, 65, 190);
        _connect.ForeColor = Color.White; _connect.Font = new Font("Segoe UI", 9F, FontStyle.Bold); _connect.Cursor = Cursors.Hand;
        _connect.Click += async (_, _) => await SaveAndConnectAsync(true); body.Controls.Add(_connect);

        _pairingCode.Location = new Point(18, 139); _pairingCode.Size = new Size(356, 35); _pairingCode.Font = new Font("Segoe UI", 10F);
        _pairingCode.BorderStyle = BorderStyle.FixedSingle; _pairingCode.PlaceholderText = "CÓDIGO DE PAREAMENTO DO HOUSE MIX"; body.Controls.Add(_pairingCode);

        _startup.Text = "Iniciar com Windows"; _startup.AutoSize = true; _startup.Location = new Point(390, 147);
        _startup.Font = new Font("Segoe UI", 9F); _startup.ForeColor = Color.FromArgb(80, 88, 100); _startup.BackColor = Color.Transparent;
        _startup.CheckedChanged += (_, _) => { if (!IsDisposed && IsHandleCreated) { try { ApplyStartupSetting(); } catch (Exception ex) { SetStatus("Não foi possível alterar a inicialização", ex.Message, Color.Firebrick); } } };
        body.Controls.Add(_startup);

        _status.Text = "●  STATUS DA CONEXÃO"; _status.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        _status.ForeColor = Color.FromArgb(140, 145, 150); _status.AutoSize = true; _status.Location = new Point(29, 190); body.Controls.Add(_status);

        _detail.Text = "Informe o IP do vMix e o código gerado no House Mix."; _detail.Font = new Font("Segoe UI", 8.5F);
        _detail.ForeColor = Color.FromArgb(105, 113, 125); _detail.AutoSize = false; _detail.Location = new Point(29, 213);
        _detail.Size = new Size(690, 28); body.Controls.Add(_detail);

        _ndiStatus.Text = "Verificando instalação do NDI Runtime…"; _ndiStatus.Font = new Font("Segoe UI", 8.5F);
        _ndiStatus.ForeColor = Color.FromArgb(105, 113, 125); _ndiStatus.AutoSize = true; _ndiStatus.Location = new Point(29, 249); body.Controls.Add(_ndiStatus);

        _ndiDownload.Text = "BAIXAR NDI RUNTIME"; _ndiDownload.Location = new Point(29, 272); _ndiDownload.Size = new Size(166, 30);
        _ndiDownload.FlatStyle = FlatStyle.Flat; _ndiDownload.FlatAppearance.BorderSize = 1; _ndiDownload.FlatAppearance.BorderColor = Color.FromArgb(0, 77, 255);
        _ndiDownload.BackColor = Color.White; _ndiDownload.ForeColor = Color.FromArgb(0, 65, 190); _ndiDownload.Font = new Font("Segoe UI", 8F, FontStyle.Bold);
        _ndiDownload.Cursor = Cursors.Hand; _ndiDownload.Visible = false;
        _ndiDownload.Click += (_, _) => { try { Process.Start(new ProcessStartInfo("https://ndi.video/tools/") { UseShellExecute = true }); } catch (Exception ex) { MessageBox.Show(this, "Não foi possível abrir o site do NDI: " + ex.Message, "Nexo Bridge", MessageBoxButtons.OK, MessageBoxIcon.Warning); } };
        body.Controls.Add(_ndiDownload);
        body.Controls.Add(new Label { Text = "Desenvolvido por Nexo Brasil - Soluções Visuais", Font = new Font("Segoe UI", 8F), ForeColor = Color.FromArgb(160, 166, 174), AutoSize = true, Location = new Point(29, 324) });
    }

    private static void DragWindow(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Left) return;
        var form = ((Control)sender!).FindForm();
        if (form is null) return;
        ReleaseCapture();
        SendMessage(form.Handle, 0xA1, (IntPtr)2, IntPtr.Zero);
    }

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private static void AddField(TableLayoutPanel panel, int row, string label, TextBox box)
    {
        var l = new Label { Text = label, AutoSize = true, ForeColor = Color.FromArgb(45, 57, 78), Anchor = AnchorStyles.Left | AnchorStyles.Bottom, Margin = new Padding(0, 0, 0, 4) };
        box.Dock = DockStyle.Fill; box.BorderStyle = BorderStyle.FixedSingle; box.Margin = new Padding(0, 3, 0, 7);
        panel.Controls.Add(l, 0, row); panel.Controls.Add(box, 0, row + 1);
    }

    private void BuildTray()
    {
        _trayMenu.Items.Add("Abrir NexoHub Bridge", null, (_, _) => ShowFromTray());
        _trayMenu.Items.Add("Verificar conexão", null, async (_, _) => await CheckConnectionAsync());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("Encerrar Bridge", null, (_, _) => ExitApplication());
        _tray.ContextMenuStrip = _trayMenu;
        _tray.Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        _tray.Text = "NexoHub Bridge";
        _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowFromTray();
    }

    private async Task InitializeAsync(bool startHidden)
    {
        try
        {
            if (await CheckForUpdatesAsync())
            {
                ExitApplication();
                return;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            if (File.Exists(_configPath))
                _config = JsonSerializer.Deserialize<BridgeConfig>(await File.ReadAllTextAsync(_configPath), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BridgeConfig();
            FillFields();
            _startup.Checked = IsStartupEnabled();
            StartNdiDiscovery();
            UpdateNdiStatus();
            if (!string.IsNullOrWhiteSpace(_config.BridgeToken))
            {
                StartService();
                SetStatus("Bridge iniciado", "Credencial salva. Verificando conexão com o House Mix e o vMix…", Color.FromArgb(0, 125, 65));
            }
            else SetStatus("Configuração necessária", "Cole o código gerado no House Mix e clique em “Salvar e conectar”.", Color.FromArgb(180, 120, 0));
            if (startHidden) HideToTray();
        }
        catch (Exception ex) { SetStatus("Não foi possível iniciar", ex.Message, Color.Firebrick); }
    }


    private async Task<bool> CheckForUpdatesAsync()
    {
        string? tempExe = null;
        string? scriptPath = null;
        try
        {
            using var handler = new HttpClientHandler { AllowAutoRedirect = false };
            using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(60) };
            http.DefaultRequestHeaders.UserAgent.ParseAdd($"NexoHubBridge-Updater/{CurrentVersion}");

            using var manifestResponse = await http.GetAsync(UpdateManifestUri, HttpCompletionOption.ResponseHeadersRead);
            if ((int)manifestResponse.StatusCode != 200) return false;
            var manifest = await manifestResponse.Content.ReadFromJsonAsync<BridgeUpdateManifest>(
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (manifest is null ||
                !Version.TryParse(manifest.Version, out var latest) ||
                latest <= CurrentVersion ||
                string.IsNullOrWhiteSpace(manifest.Sha256) ||
                manifest.Sha256.Length != 64 ||
                !manifest.Sha256.All(Uri.IsHexDigit) ||
                !Uri.TryCreate(manifest.DownloadUrl, UriKind.Absolute, out var download) ||
                !IsAllowedUpdateUri(download))
                return false;

            using var downloadResponse = await http.GetAsync(download, HttpCompletionOption.ResponseHeadersRead);
            if ((int)downloadResponse.StatusCode != 200) return false;
            const long maxUpdateBytes = 150_000_000;
            if (downloadResponse.Content.Headers.ContentLength is > maxUpdateBytes) return false;

            tempExe = Path.Combine(Path.GetTempPath(), $"NexoHubBridge-{Guid.NewGuid():N}.exe");
            await using (var source = await downloadResponse.Content.ReadAsStreamAsync())
            await using (var destination = new FileStream(tempExe, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                var buffer = new byte[81920];
                long totalBytes = 0;
                while (true)
                {
                    var bytesRead = await source.ReadAsync(buffer.AsMemory(0, buffer.Length));
                    if (bytesRead == 0) break;
                    totalBytes += bytesRead;
                    if (totalBytes > maxUpdateBytes)
                        throw new InvalidDataException("O arquivo de atualização excede o limite permitido.");
                    await destination.WriteAsync(buffer.AsMemory(0, bytesRead));
                }
                await destination.FlushAsync();
            }

            await using var verifyStream = File.OpenRead(tempExe);
            var actualHash = Convert.ToHexString(await SHA256.HashDataAsync(verifyStream));
            if (!string.Equals(actualHash, manifest.Sha256, StringComparison.OrdinalIgnoreCase))
            {
                File.Delete(tempExe);
                return false;
            }

            var currentExe = Application.ExecutablePath;
            if (string.IsNullOrWhiteSpace(currentExe) || !File.Exists(currentExe))
            {
                File.Delete(tempExe);
                return false;
            }

            static string PsQuote(string value) => "'" + value.Replace("'", "''") + "'";
            scriptPath = Path.Combine(Path.GetTempPath(), $"NexoHubBridge-update-{Guid.NewGuid():N}.ps1");
            var script = string.Join(Environment.NewLine, new[]
            {
                "$ErrorActionPreference = 'Stop'",
                "Start-Sleep -Seconds 2",
                $"$current = {PsQuote(currentExe)}",
                $"$download = {PsQuote(tempExe)}",
                $"$expected = {PsQuote(actualHash)}",
                "$backup = $current + '.previous'",
                "try {",
                "  Copy-Item -LiteralPath $current -Destination $backup -Force",
                "  Copy-Item -LiteralPath $download -Destination $current -Force",
                "  $installed = (Get-FileHash -LiteralPath $current -Algorithm SHA256).Hash",
                "  if ($installed -ne $expected) { throw 'SHA-256 mismatch after replacement' }",
                "  Start-Process -FilePath $current",
                "  Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue",
                "} catch {",
                "  if (Test-Path -LiteralPath $backup) { Copy-Item -LiteralPath $backup -Destination $current -Force; Start-Process -FilePath $current }",
                "  exit 1",
                "} finally {",
                "  Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue",
                "  Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue",
                "}"
            }) + Environment.NewLine;
            await File.WriteAllTextAsync(scriptPath, script, new System.Text.UTF8Encoding(false));

            var startInfo = new ProcessStartInfo("powershell.exe")
            {
                UseShellExecute = false,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add("-NoProfile");
            startInfo.ArgumentList.Add("-NonInteractive");
            startInfo.ArgumentList.Add("-ExecutionPolicy");
            startInfo.ArgumentList.Add("Bypass");
            startInfo.ArgumentList.Add("-File");
            startInfo.ArgumentList.Add(scriptPath);
            if (Process.Start(startInfo) is null) throw new InvalidOperationException("Não foi possível iniciar o atualizador.");
            return true;
        }
        catch (Exception ex)
        {
            Debug.WriteLine($"Atualização automática indisponível; mantendo v{CurrentVersion}: {ex.Message}");
            try { if (tempExe is not null && File.Exists(tempExe)) File.Delete(tempExe); } catch { }
            try { if (scriptPath is not null && File.Exists(scriptPath)) File.Delete(scriptPath); } catch { }
            return false;
        }
    }

    private static bool IsAllowedUpdateUri(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps &&
        string.Equals(uri.Host, "housemix.nexobrasil.net", StringComparison.OrdinalIgnoreCase) &&
        uri.Port == 443 &&
        string.IsNullOrEmpty(uri.UserInfo) &&
        string.IsNullOrEmpty(uri.Query) &&
        string.IsNullOrEmpty(uri.Fragment) &&
        string.Equals(uri.AbsolutePath, "/downloads/nexohub-bridge/NexoHubBridge.exe", StringComparison.Ordinal);

    private void FillFields()
    {
        _device.Text = _config.DeviceName;
        _vmixUrl.Text = _config.VmixUrl.Replace("http://", "", StringComparison.OrdinalIgnoreCase).Replace("https://", "", StringComparison.OrdinalIgnoreCase);
        _pairingCode.Text = _config.PairingCode;
        _username.Text = _config.VmixUsername;
        _password.Text = _config.VmixPassword;
    }

    private BridgeConfig ReadFields()
    {
        var c = _config;
        c.DeviceName = string.IsNullOrWhiteSpace(_device.Text) ? Environment.MachineName : _device.Text.Trim();
        var vmixInput = string.IsNullOrWhiteSpace(_vmixUrl.Text) ? "127.0.0.1:8088" : _vmixUrl.Text.Trim().TrimEnd('/');
        c.VmixUrl = vmixInput.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || vmixInput.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            ? vmixInput : "http://" + vmixInput;
        c.PairingCode = _pairingCode.Text.Trim();
        c.VmixUsername = _username.Text.Trim();
        c.VmixPassword = _password.Text;
        c.PollIntervalMs = 1000;
        if (!Uri.TryCreate(c.VmixUrl, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            throw new InvalidOperationException("Informe um endereço válido para a API do vMix, por exemplo http://127.0.0.1:8088.");
        if (!Uri.TryCreate(c.SupabaseUrl, UriKind.Absolute, out var cloud) || cloud.Scheme != "https")
            throw new InvalidOperationException("O endereço seguro do serviço House Mix está inválido.");
        return c;
    }

    private async Task SaveOnlyAsync()
    {
        try
        {
            _config = ReadFields();
            await SaveConfigAsync(_config);
            ApplyStartupSetting();
            SetStatus("Configurações salvas", "As informações foram guardadas neste usuário do Windows.", Color.FromArgb(0, 125, 65));
        }
        catch (Exception ex) { MessageBox.Show(this, ex.Message, "Verifique os dados", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }

    private async Task SaveAndConnectAsync(bool minimizeAfter)
    {
        if (_busy) return;
        _busy = true; _connect.Enabled = false; _save.Enabled = false;
        try
        {
            _config = ReadFields();
            await SaveConfigAsync(_config);
            ApplyStartupSetting();
            if (string.IsNullOrWhiteSpace(_config.BridgeToken))
            {
                if (string.IsNullOrWhiteSpace(_config.PairingCode))
                    throw new InvalidOperationException("Abra o House Mix, gere o código em “Ponte remota” e cole-o no campo de pareamento.");
                SetStatus("Pareando estúdio…", "Conectando ao serviço House Mix com segurança.", Color.FromArgb(180, 120, 0));
                using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
                _config.BridgeToken = await BridgeService.PairAsync(client, _config);
                _config.PairingCode = "";
                await SaveConfigAsync(_config);
                _pairingCode.Clear();
            }
            StartService();
            SetStatus("Conectado ao House Mix", "O Bridge está ativo. Você pode minimizá-lo para a bandeja do Windows.", Color.FromArgb(0, 125, 65));
            _tray.ShowBalloonTip(2500, "NexoHub Bridge", "Configuração salva. O Bridge está em execução em segundo plano.", ToolTipIcon.Info);
            if (minimizeAfter) HideToTray();
        }
        catch (Exception ex)
        {
            SetStatus("Conexão não concluída", ex.Message, Color.Firebrick);
            MessageBox.Show(this, ex.Message, "NexoHub Bridge", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
        finally { _busy = false; _connect.Enabled = true; _save.Enabled = true; }
    }

    private async Task SaveConfigAsync(BridgeConfig config)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        var temp = _configPath + ".tmp";
        await File.WriteAllTextAsync(temp, json);
        File.Move(temp, _configPath, true);
    }

    private void ApplyStartupSetting()
    {
        using var key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        if (_startup.Checked) key?.SetValue("NexoHubBridge", $"\"{Application.ExecutablePath}\" --background");
        else key?.DeleteValue("NexoHubBridge", false);
    }

    private bool IsStartupEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
        return string.Equals(key?.GetValue("NexoHubBridge") as string, $"\"{Application.ExecutablePath}\" --background", StringComparison.OrdinalIgnoreCase);
    }

    private void UpdateNdiStatus()
    {
        var installed = IsNdiRuntimeInstalled();
        _ndiStatus.Text = installed ? "NDI Runtime detectado neste computador." : "NDI Runtime não encontrado. A descoberta NDI ficará indisponível.";
        _ndiStatus.ForeColor = installed ? Color.FromArgb(0, 125, 65) : Color.FromArgb(170, 92, 0);
        _ndiDownload.Visible = !installed;
    }

    private static bool IsNdiRuntimeInstalled()
    {
        var pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        const string dll = "Processing.NDI.Lib.x64.dll";
        var candidates = new[]
        {
            Path.Combine(pf, "NDI", "NDI 6 Runtime", dll), Path.Combine(pf, "NDI", "NDI 5 Runtime", dll),
            Path.Combine(pf, "NDI", "NDI 6 SDK", "Bin", "x64", dll), Path.Combine(pf, "NDI", "NDI 5 SDK", "Bin", "x64", dll),
            Path.Combine(pf86, "NDI", "NDI 6 Runtime", dll), Path.Combine(pf86, "NDI", "NDI 5 Runtime", dll)
        };
        if (candidates.Any(File.Exists)) return true;
        var registryPaths = new[]
        {
            (RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
            (RegistryHive.LocalMachine, @"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
            (RegistryHive.CurrentUser, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
        };
        foreach (var (hive, path) in registryPaths)
        {
            using var baseKey = RegistryKey.OpenBaseKey(hive, RegistryView.Default);
            using var root = baseKey.OpenSubKey(path);
            if (root is null) continue;
            foreach (var name in root.GetSubKeyNames())
            {
                using var item = root.OpenSubKey(name);
                var displayName = item?.GetValue("DisplayName") as string;
                if (!string.IsNullOrWhiteSpace(displayName) && displayName.Contains("NDI", StringComparison.OrdinalIgnoreCase) &&
                    (displayName.Contains("Runtime", StringComparison.OrdinalIgnoreCase) || displayName.Contains("Tools", StringComparison.OrdinalIgnoreCase) || displayName.Contains("SDK", StringComparison.OrdinalIgnoreCase)))
                    return true;
            }
        }
        return false;
    }

    private void StartNdiDiscovery()
    {
        _serviceCts ??= new CancellationTokenSource();
        _ = Task.Run(async () =>
        {
            try { await NdiNetworkDiscovery.RunAsync(_serviceCts.Token); }
            catch (Exception ex) { UpdateUi(() => _detail.Text = "Descoberta NDI local indisponível: " + ex.Message); }
        });
    }

    private void StartService()
    {
        if (_service is not null) return;
        _serviceCts ??= new CancellationTokenSource();
        _service = new BridgeService(_config, message => UpdateUi(() =>
        {
            if (message.StartsWith("OK:", StringComparison.Ordinal))
                SetStatus("Bridge conectado", message[3..], Color.FromArgb(0, 125, 65));
            else if (message.StartsWith("WARN:", StringComparison.Ordinal))
                SetStatus("Reconectando…", message[5..], Color.FromArgb(180, 120, 0));
            else SetStatus("Bridge ativo", message, Color.FromArgb(0, 125, 65));
        }));
        _ = Task.Run(() => _service.RunAsync(_serviceCts.Token));
    }

    private async Task CheckConnectionAsync()
    {
        if (string.IsNullOrWhiteSpace(_config.BridgeToken))
        {
            ShowFromTray();
            SetStatus("Configuração necessária", "Abra a janela e conecte o estúdio.", Color.FromArgb(180, 120, 0));
            return;
        }
        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            using var response = await client.GetAsync(_config.VmixUrl.TrimEnd('/') + "/api/");
            SetStatus(response.IsSuccessStatusCode ? "vMix acessível" : "vMix respondeu com aviso",
                $"A API local do vMix respondeu com HTTP {(int)response.StatusCode}. O relay em nuvem continua sendo verificado em segundo plano.",
                response.IsSuccessStatusCode ? Color.FromArgb(0, 125, 65) : Color.FromArgb(180, 120, 0));
        }
        catch (Exception ex) { SetStatus("vMix indisponível", ex.Message, Color.Firebrick); }
    }

    private void SetStatus(string title, string detail, Color color)
    {
        _status.Text = "●  " + (title.Contains("conect", StringComparison.OrdinalIgnoreCase) || title.Contains("acessível", StringComparison.OrdinalIgnoreCase) ? "STATUS DA CONEXÃO: CONECTADO" : title.Contains("Reconect", StringComparison.OrdinalIgnoreCase) ? "STATUS DA CONEXÃO: RECONECTANDO" : "STATUS DA CONEXÃO: " + title.ToUpperInvariant());
        _status.ForeColor = color;
        _detail.Text = detail;
        _tray.Text = ("NexoHub Bridge — " + title).Length > 63 ? "NexoHub Bridge" : "NexoHub Bridge — " + title;
    }

    private void UpdateUi(Action action)
    {
        if (IsDisposed) return;
        try { if (InvokeRequired) BeginInvoke(action); else action(); } catch (InvalidOperationException) { }
    }

    private void HideToTray()
    {
        Hide();
        ShowInTaskbar = false;
        _tray.Visible = true;
    }

    private void ShowFromTray()
    {
        Show();
        ShowInTaskbar = true;
        WindowState = FormWindowState.Normal;
        Activate();
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (!_reallyClosing && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            HideToTray();
            _tray.ShowBalloonTip(1800, "NexoHub Bridge", "O Bridge continua funcionando em segundo plano.", ToolTipIcon.Info);
        }
    }

    private void ExitApplication()
    {
        _reallyClosing = true;
        _serviceCts?.Cancel();
        _tray.Visible = false;
        _tray.Dispose();
        Application.Exit();
    }
}

internal sealed class BridgeService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };
    private readonly BridgeConfig _config;
    private readonly Action<string> _report;
    public BridgeService(BridgeConfig config, Action<string> report) { _config = config; _report = report; }

    public async Task RunAsync(CancellationToken token)
    {
        using var cloud = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        using var vmix = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(8) };
        cloud.DefaultRequestHeaders.UserAgent.ParseAdd("NexoHubBridge/1.0");
        if (!string.IsNullOrWhiteSpace(_config.VmixUsername))
            vmix.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
                Convert.ToBase64String(Encoding.UTF8.GetBytes($"{_config.VmixUsername}:{_config.VmixPassword}")));
        int failures = 0;
        while (!token.IsCancellationRequested)
        {
            try
            {
                var poll = await CloudPostAsync<PollResponse>(cloud, _config, "vmix-bridge-poll", new { action = "poll" }, token);
                if (failures > 0) _report("OK:Conexão com o House Mix restabelecida.");
                failures = 0;
                if (poll?.Job is { } job)
                {
                    var result = await ExecuteJobAsync(vmix, _config, job, token);
                    await CloudPostAsync<JsonElement>(cloud, _config, "vmix-bridge-result",
                        new { jobId = job.Id, success = result.Success, statusCode = result.Status, body = result.Body }, token);
                }
                else await Task.Delay(Math.Clamp(_config.PollIntervalMs, 750, 5000), token);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                failures++;
                if (failures == 1 || failures % 10 == 0) _report($"WARN:Sem conexão ({failures}). Tentando novamente: {Short(ex.Message)}");
                await Task.Delay(Math.Min(1000 * Math.Min(failures, 10), 10000), token);
            }
        }
    }

    public static async Task<string> PairAsync(HttpClient client, BridgeConfig c)
    {
        using var r = await client.PostAsJsonAsync(c.SupabaseUrl.TrimEnd('/') + "/functions/v1/vmix-bridge-connect",
            new { pairingCode = c.PairingCode, deviceName = c.DeviceName });
        var b = await r.Content.ReadAsStringAsync();
        if (!r.IsSuccessStatusCode) throw new InvalidOperationException($"O serviço recusou o pareamento (HTTP {(int)r.StatusCode}): {Short(b)}");
        return JsonSerializer.Deserialize<PairResponse>(b, JsonOptions)?.Token is { Length: > 10 } t
            ? t : throw new InvalidOperationException("O serviço não retornou a credencial de pareamento esperada.");
    }

    private static async Task<T?> CloudPostAsync<T>(HttpClient client, BridgeConfig c, string fn, object data, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, c.SupabaseUrl.TrimEnd('/') + "/functions/v1/" + fn);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", c.BridgeToken);
        req.Content = JsonContent.Create(data);
        using var res = await client.SendAsync(req, ct);
        var body = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode) throw new InvalidOperationException($"{fn} HTTP {(int)res.StatusCode}: {Short(body)}");
        if (typeof(T) == typeof(JsonElement) || string.IsNullOrWhiteSpace(body)) return default;
        return JsonSerializer.Deserialize<T>(body, JsonOptions);
    }

    private static async Task<(bool Success, int Status, string Body)> ExecuteJobAsync(HttpClient client, BridgeConfig c, BridgeJob job, CancellationToken ct)
    {
        var rawPath = job.Path ?? "";
        var rawPathOnly = rawPath.Split('?', 2)[0];
        var decodedPath = Uri.UnescapeDataString(rawPathOnly);
        if (string.IsNullOrWhiteSpace(rawPath) ||
            !rawPath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) ||
            rawPath.Contains("://", StringComparison.Ordinal) ||
            rawPath.Contains('\\') || rawPath.Contains('#') || rawPath.Any(char.IsControl) ||
            rawPathOnly.Contains("%2f", StringComparison.OrdinalIgnoreCase) ||
            rawPathOnly.Contains("%5c", StringComparison.OrdinalIgnoreCase) ||
            decodedPath.Split('/').Any(segment => segment is "." or ".."))
            return (false, 400, "Rejected: only normalized vMix /api/ paths are allowed.");

        var baseUri = new Uri(c.VmixUrl.TrimEnd('/') + "/");
        var target = new Uri(baseUri, rawPath.TrimStart('/'));
        if (!string.Equals(target.Scheme, baseUri.Scheme, StringComparison.OrdinalIgnoreCase) ||
            !string.Equals(target.Host, baseUri.Host, StringComparison.OrdinalIgnoreCase) ||
            target.Port != baseUri.Port ||
            !target.AbsolutePath.StartsWith("/api/", StringComparison.OrdinalIgnoreCase))
            return (false, 400, "Rejected: destination must remain within the configured vMix /api/ endpoint.");
        using var req = new HttpRequestMessage(job.Method == "POST" ? HttpMethod.Post : HttpMethod.Get, target);
        if (job.Body is { } body && job.Method == "POST")
            req.Content = new StringContent(body.GetRawText(), Encoding.UTF8, "application/json");
        using var res = await client.SendAsync(req, ct);
        var content = await res.Content.ReadAsStringAsync(ct);
        return ((int)res.StatusCode is >= 200 and < 300, (int)res.StatusCode, content.Length > 500000 ? content[..500000] : content);
    }

    private static string Short(string s) => s.Length > 500 ? s[..500] : s;
}