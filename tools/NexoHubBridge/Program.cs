using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.Win32;
using System.Drawing;
using System.Windows.Forms;

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
        Text = "NexoHub Bridge";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(590, 590);
        Size = new Size(650, 690);
        Font = new Font("Segoe UI", 9F);
        BackColor = Color.FromArgb(246, 248, 251);
        BuildUi();
        BuildTray();
        Load += async (_, _) => await InitializeAsync(startHidden);
        Resize += (_, _) => { if (WindowState == FormWindowState.Minimized) HideToTray(); };
        FormClosing += OnFormClosing;
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(24), ColumnCount = 1, RowCount = 5 };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 72));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 70));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));
        Controls.Add(root);

        var header = new Panel { Dock = DockStyle.Fill };
        var title = new Label { Text = "NexoHub Bridge", Font = new Font("Segoe UI Semibold", 20F, FontStyle.Bold), ForeColor = Color.FromArgb(20, 35, 65), AutoSize = true, Location = new Point(0, 0) };
        var subtitle = new Label { Text = "Conexão segura entre o House Mix e o vMix deste estúdio", ForeColor = Color.FromArgb(90, 103, 125), AutoSize = true, Location = new Point(2, 38) };
        header.Controls.Add(title); header.Controls.Add(subtitle); root.Controls.Add(header, 0, 0);

        var statusCard = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(12) };
        _status.Text = "●  Preparando aplicativo…"; _status.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold); _status.ForeColor = Color.FromArgb(180, 120, 0); _status.AutoSize = true; _status.Location = new Point(12, 7);
        _detail.Text = "Você poderá minimizar esta janela para a bandeja do Windows."; _detail.ForeColor = Color.FromArgb(90, 103, 125); _detail.AutoSize = true; _detail.Location = new Point(13, 29);
        statusCard.Controls.Add(_status); statusCard.Controls.Add(_detail); root.Controls.Add(statusCard, 0, 1);

        var fields = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 12, Padding = new Padding(0, 14, 0, 8) };
        fields.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        for (int i = 0; i < 6; i++) { fields.RowStyles.Add(new RowStyle(SizeType.Absolute, 24)); fields.RowStyles.Add(new RowStyle(SizeType.Absolute, i == 2 ? 52 : 38)); }
        AddField(fields, 0, "Nome deste estúdio", _device);
        AddField(fields, 2, "Endereço do vMix neste computador", _vmixUrl);
        AddField(fields, 4, "Código de pareamento (gerado no House Mix)", _pairingCode);
        AddField(fields, 6, "Usuário da API do vMix (se houver)", _username);
        AddField(fields, 8, "Senha da API do vMix (se houver)", _password);
        _password.UseSystemPasswordChar = true;
        _startup.Text = "Iniciar o NexoHub Bridge junto com o Windows"; _startup.AutoSize = true; _startup.ForeColor = Color.FromArgb(45, 57, 78); _startup.Margin = new Padding(0, 10, 0, 0);
        fields.Controls.Add(_startup, 0, 10);
        var hint = new Label { Text = "O código é usado uma vez. Depois do pareamento, a credencial é guardada no perfil deste usuário.", AutoSize = true, ForeColor = Color.FromArgb(90, 103, 125), MaximumSize = new Size(540, 0), Padding = new Padding(0, 8, 0, 0) };
        fields.Controls.Add(hint, 0, 11);
        root.Controls.Add(fields, 0, 2);

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false, Padding = new Padding(0, 12, 0, 0) };
        _connect.Text = "Salvar e conectar"; _connect.Width = 180; _connect.Height = 42; _connect.FlatStyle = FlatStyle.Flat; _connect.FlatAppearance.BorderSize = 0; _connect.BackColor = Color.FromArgb(0, 91, 187); _connect.ForeColor = Color.White; _connect.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold); _connect.Cursor = Cursors.Hand;
        _connect.Click += async (_, _) => await SaveAndConnectAsync(true);
        _save.Text = "Salvar configurações"; _save.Width = 160; _save.Height = 42; _save.FlatStyle = FlatStyle.Flat; _save.BackColor = Color.White; _save.ForeColor = Color.FromArgb(30, 50, 80); _save.Cursor = Cursors.Hand;
        _save.Click += async (_, _) => await SaveOnlyAsync();
        var minimize = new Button { Text = "Minimizar", Width = 100, Height = 42, FlatStyle = FlatStyle.Flat, BackColor = Color.White, ForeColor = Color.FromArgb(30, 50, 80), Cursor = Cursors.Hand };
        minimize.Click += (_, _) => HideToTray();
        buttons.Controls.Add(_connect); buttons.Controls.Add(_save); buttons.Controls.Add(minimize); root.Controls.Add(buttons, 0, 3);

        var footer = new Label { Text = "Nexo Brasil  •  O ícone ao lado do relógio mantém o Bridge em execução.", AutoSize = true, ForeColor = Color.FromArgb(105, 115, 132), Anchor = AnchorStyles.Left | AnchorStyles.Bottom, Padding = new Padding(0, 8, 0, 0) };
        root.Controls.Add(footer, 0, 4);
    }

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
        _tray.Icon = SystemIcons.Application;
        _tray.Text = "NexoHub Bridge";
        _tray.Visible = true;
        _tray.DoubleClick += (_, _) => ShowFromTray();
    }

    private async Task InitializeAsync(bool startHidden)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_configPath)!);
            if (File.Exists(_configPath))
                _config = JsonSerializer.Deserialize<BridgeConfig>(await File.ReadAllTextAsync(_configPath), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new BridgeConfig();
            FillFields();
            _startup.Checked = IsStartupEnabled();
            StartNdiDiscovery();
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

    private void FillFields()
    {
        _device.Text = _config.DeviceName;
        _vmixUrl.Text = _config.VmixUrl;
        _pairingCode.Text = _config.PairingCode;
        _username.Text = _config.VmixUsername;
        _password.Text = _config.VmixPassword;
    }

    private BridgeConfig ReadFields()
    {
        var c = _config;
        c.DeviceName = string.IsNullOrWhiteSpace(_device.Text) ? Environment.MachineName : _device.Text.Trim();
        c.VmixUrl = string.IsNullOrWhiteSpace(_vmixUrl.Text) ? "http://127.0.0.1:8088" : _vmixUrl.Text.Trim().TrimEnd('/');
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
        _status.Text = "●  " + title;
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
        using var vmix = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
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
        if (string.IsNullOrWhiteSpace(job.Path) || !job.Path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase) ||
            job.Path.Contains("://") || job.Path.Contains('\\'))
            return (false, 400, "Rejected: only vMix /api/ paths are allowed.");
        var baseUri = new Uri(c.VmixUrl.TrimEnd('/') + "/");
        var target = new Uri(baseUri, job.Path.TrimStart('/'));
        if (target.Host != baseUri.Host || target.Port != baseUri.Port)
            return (false, 400, "Rejected: destination must be the configured vMix host.");
        using var req = new HttpRequestMessage(job.Method == "POST" ? HttpMethod.Post : HttpMethod.Get, target);
        if (job.Body is { } body && job.Method == "POST")
            req.Content = new StringContent(body.GetRawText(), Encoding.UTF8, "application/json");
        using var res = await client.SendAsync(req, ct);
        var content = await res.Content.ReadAsStringAsync(ct);
        return ((int)res.StatusCode is >= 200 and < 400, (int)res.StatusCode, content.Length > 500000 ? content[..500000] : content);
    }

    private static string Short(string s) => s.Length > 500 ? s[..500] : s;
}