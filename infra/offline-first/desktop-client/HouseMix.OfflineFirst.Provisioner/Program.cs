using System.Security.Cryptography;
using System.Text;
using HouseMix.OfflineFirst.Transport;
using Npgsql;

namespace HouseMix.OfflineFirst.Provisioner;

internal static class Program
{
    private const string DatabaseName = "housemix_local";
    private const string RuntimeRole = "housemix_runtime";
    private const int PostgreSqlPort = 5432;

    private static async Task<int> Main()
    {
        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("Provisionamento disponível somente no Windows.");
            return 1;
        }

        Console.WriteLine("HOUSE MIX — Preparação do banco local");
        Console.WriteLine("Este assistente conecta somente ao PostgreSQL neste computador (127.0.0.1).");
        Console.Write("Nome da rádio: ");
        var stationName = Console.ReadLine()?.Trim();
        if (string.IsNullOrWhiteSpace(stationName) || stationName.Length > 160)
        {
            Console.Error.WriteLine("Informe um nome de rádio com até 160 caracteres.");
            return 2;
        }

        Console.Write("Senha do administrador PostgreSQL (usuário postgres): ");
        var adminPassword = ReadSecret();
        if (string.IsNullOrEmpty(adminPassword))
        {
            Console.Error.WriteLine("A senha do administrador é obrigatória.");
            return 2;
        }

        var runtimePassword = Convert.ToBase64String(RandomNumberGenerator.GetBytes(36))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        try
        {
            var adminBuilder = new NpgsqlConnectionStringBuilder
            {
                Host = "127.0.0.1",
                Port = PostgreSqlPort,
                Database = "postgres",
                Username = "postgres",
                Password = adminPassword,
                SslMode = SslMode.Disable,
                Timeout = 5,
                CommandTimeout = 30,
                Pooling = false
            };

            await using (var admin = new NpgsqlConnection(adminBuilder.ConnectionString))
            {
                await admin.OpenAsync();
                await EnsureRuntimeRoleAsync(admin, runtimePassword);
                await EnsureDatabaseAsync(admin);
            }

            var runtimeBuilder = new NpgsqlConnectionStringBuilder
            {
                Host = "127.0.0.1",
                Port = PostgreSqlPort,
                Database = DatabaseName,
                Username = RuntimeRole,
                Password = runtimePassword,
                SslMode = SslMode.Disable,
                Timeout = 5,
                CommandTimeout = 60
            };
            await using (var runtime = new NpgsqlConnection(runtimeBuilder.ConnectionString))
            {
                await runtime.OpenAsync();
                await ApplySchemaAsync(runtime);
                await CreateTenantAsync(runtime, stationName);
                await using var verify = new NpgsqlCommand(
                    "SELECT to_regclass('public.tenants') IS NOT NULL AND to_regclass('public.sync_outbox') IS NOT NULL",
                    runtime);
                if (await verify.ExecuteScalarAsync() is not true)
                    throw new InvalidOperationException("A validação das tabelas locais falhou.");
            }

            var connectionUri = $"postgres://{RuntimeRole}:{Uri.EscapeDataString(runtimePassword)}@127.0.0.1:{PostgreSqlPort}/{DatabaseName}";
            var credentialStore = new LocalDatabaseCredentialStore();
            await credentialStore.SaveAsync(connectionUri);
            Console.WriteLine();
            Console.WriteLine("BANCO LOCAL CONFIGURADO COM SUCESSO.");
            Console.WriteLine("A credencial de execução foi protegida pelo DPAPI da conta Windows atual.");
            Console.WriteLine("O House Mix ainda não inicia automaticamente a API nesta etapa.");
            Console.WriteLine("Mantenha o PostgreSQL em execução. Não compartilhe a senha administrativa.");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Falha no provisionamento: {Classify(exception)}");
            return 1;
        }
        finally
        {
            adminPassword = string.Empty;
            runtimePassword = string.Empty;
        }
    }

    private static async Task EnsureRuntimeRoleAsync(NpgsqlConnection admin, string password)
    {
        await using var exists = new NpgsqlCommand(
            "SELECT 1 FROM pg_roles WHERE rolname = @role", admin);
        exists.Parameters.AddWithValue("role", RuntimeRole);
        var found = await exists.ExecuteScalarAsync() is not null;
        var sql = found
            ? "ALTER ROLE housemix_runtime WITH LOGIN PASSWORD " 
            : "CREATE ROLE housemix_runtime WITH LOGIN PASSWORD ";
        await using var formatted = new NpgsqlCommand("SELECT format(@statement || '%L', @password)", admin);
        formatted.Parameters.AddWithValue("statement", sql);
        formatted.Parameters.AddWithValue("password", password);
        var commandText = (string?)await formatted.ExecuteScalarAsync()
            ?? throw new InvalidOperationException("Não foi possível preparar a credencial do banco.");
        await using var command = new NpgsqlCommand(commandText, admin);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task EnsureDatabaseAsync(NpgsqlConnection admin)
    {
        await using var exists = new NpgsqlCommand(
            "SELECT 1 FROM pg_database WHERE datname = @database", admin);
        exists.Parameters.AddWithValue("database", DatabaseName);
        if (await exists.ExecuteScalarAsync() is null)
        {
            await using var create = new NpgsqlCommand(
                "CREATE DATABASE housemix_local OWNER housemix_runtime", admin);
            await create.ExecuteNonQueryAsync();
        }
        else
        {
            await using var alter = new NpgsqlCommand(
                "ALTER DATABASE housemix_local OWNER TO housemix_runtime", admin);
            await alter.ExecuteNonQueryAsync();
        }
    }

    private static async Task ApplySchemaAsync(NpgsqlConnection runtime)
    {
        var schemaDirectory = Path.Combine(AppContext.BaseDirectory, "schema");
        foreach (var fileName in new[] { "001_local_control_plane.sql", "002_one_time_device_enrollment.sql" })
        {
            var path = Path.Combine(schemaDirectory, fileName);
            if (!File.Exists(path))
                throw new FileNotFoundException("Arquivo de schema do House Mix não encontrado.", path);
            var sql = await File.ReadAllTextAsync(path, Encoding.UTF8);
            await using var command = new NpgsqlCommand(sql, runtime) { CommandTimeout = 60 };
            await command.ExecuteNonQueryAsync();
        }
    }

    private static async Task CreateTenantAsync(NpgsqlConnection runtime, string stationName)
    {
        var slug = $"radio-{Guid.NewGuid():N}";
        await using var command = new NpgsqlCommand(
            "INSERT INTO tenants (slug, display_name, status) VALUES (@slug, @name, 'active') " +
            "ON CONFLICT (slug) DO NOTHING", runtime);
        command.Parameters.AddWithValue("slug", slug);
        command.Parameters.AddWithValue("name", stationName);
        await command.ExecuteNonQueryAsync();
    }

    private static string ReadSecret()
    {
        var builder = new StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) break;
            if (key.Key == ConsoleKey.Backspace)
            {
                if (builder.Length > 0) builder.Length--;
                continue;
            }
            if (!char.IsControl(key.KeyChar)) builder.Append(key.KeyChar);
        }
        Console.WriteLine();
        return builder.ToString();
    }

    private static string Classify(Exception exception) => exception switch
    {
        NpgsqlException => "postgresql_indisponivel_ou_credenciais_invalidas",
        UnauthorizedAccessException => "acesso_negado_ao_armazenamento_local",
        CryptographicException => "falha_dpapi",
        IOException => "falha_ao_ler_schema",
        _ => "erro_de_configuracao"
    };
}
