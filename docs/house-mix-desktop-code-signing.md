# Assinatura digital do House Mix Desktop

O instalador deve usar uma identidade de Code Signing validada por uma autoridade
confiável para identificar a empresa no Windows. Alterar apenas nome, ícone ou
metadados do executável não corrige “Fornecedor desconhecido”. Certificados
autoassinados também não resolvem a distribuição pública.

## Configuração pendente

Se a empresa já possui um certificado de Code Signing exportável em PFX/P12,
configurar estes **secrets do repositório GitHub**:

- `HMD_WINDOWS_CSC_LINK`: certificado em base64 ou URL HTTPS protegida compatível com electron-builder.
- `HMD_WINDOWS_CSC_KEY_PASSWORD`: senha do certificado, quando aplicável.

Nunca adicionar certificado, chave privada, senha ou base64 ao código, a commits
ou a mensagens do chat. A base64 não protege a chave: deve ficar em GitHub Secrets.
Certificados em token/HSM ou serviços de assinatura exigem integração específica;
não exportar uma chave que o provedor mantém em hardware.

Os dois workflows de empacotamento executam
`scripts/package-housemix-desktop.ps1`. Com o certificado configurado, o build
exige assinatura e valida Authenticode e carimbo de tempo do aplicativo e do
instalador antes de publicar. Sem certificado, mantém a distribuição atual e
emite um aviso explícito: a correção do fornecedor ainda não está ativa.

Para conferir apenas a configuração, sem gerar instalador:

```powershell
./scripts/package-housemix-desktop.ps1 -ValidateOnly
```

## Limite do SmartScreen

Uma assinatura válida permite identificar o fornecedor. Ela não garante que o
SmartScreen elimine o alerta imediatamente: a Microsoft também avalia reputação
e mantém a decisão sobre o aviso. Usar a mesma identidade nas próximas versões
permite construir reputação. Não desativar SmartScreen nem alterar proteções dos
computadores dos usuários para contornar o aviso.

Referências:

- https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
- https://www.electron.build/v26/docs/features/code-signing/code-signing-win/
