
Objetivo: eliminar o erro “Servidor ainda iniciando…” no login e reduzir as quedas/timeout do backend público.

Diagnóstico (já confirmado)
- A mensagem vem de `src/components/LoginScreen.tsx` (fallback após 2 timeouts de autenticação).
- Há alertas de timeout no carregamento de auth (`useAuth`).
- Nos logs do backend, a função pública da tela externa está com picos de `503/504` e execuções muito longas, indicando saturação/intermitência da infraestrutura (não é erro de senha).

Plano de ação

1) Contenção imediata (o que fazer agora)
- Fechar abas/dispositivos com tela externa pública abertas em paralelo.
- Aguardar 30–60s e atualizar com `Ctrl+F5`.
- Tentar login novamente.
- Se persistir por mais de 5 minutos, tratar como instabilidade de capacidade do backend (etapa 5).

2) Robustez no login (UX + retries reais)
- Em `src/components/LoginScreen.tsx`:
  - Trocar retry fixo por backoff exponencial (ex.: 3 tentativas com jitter).
  - Diferenciar erro de credencial vs indisponibilidade do backend.
  - Exibir mensagem orientativa com botão “Tentar novamente”.
  - Evitar múltiplos submits simultâneos.

3) Robustez na inicialização de sessão
- Em `src/hooks/useAuth.tsx`:
  - Substituir “force load complete” único por estratégia com retries graduais antes de desistir.
  - Reduzir falso-negativo de sessão quando o backend está lento.
  - Manter estado consistente (não cair para login prematuramente se sessão ainda está sendo restaurada).

4) Redução de carga da tela externa pública
- Em `src/pages/CenarioTela.tsx`:
  - Aumentar intervalo mínimo inicial de polling público e adicionar jitter.
  - Em `503/504`, subir backoff mais agressivo e suspender chamadas redundantes por janela curta.
  - Garantir deduplicação estrita por usuário (inclusive entre blocos de config/música).

5) Alívio da função pública de dados + capacidade
- Em `supabase/functions/public-cenario-data/index.ts`:
  - Priorizar dados já em banco/cache e evitar fallback caro em cascata quando backend está sob pressão.
  - Paralelizar leituras independentes e limitar custo por request.
  - Adicionar cache curto em memória por `uid` para absorver rajadas.
- Operacional (Lovable Cloud):
  - Se mesmo com otimizações continuar com picos de 503/504, subir a instância em Backend → Advanced settings → Upgrade instance.

Validação (aceite)
- Login deve completar sem cair no erro genérico em rede normal.
- Em instabilidade, mensagem deve ser clara (“backend lento/indisponível”) e recuperar sozinha após retry.
- Queda significativa de 503/504 da função pública e tempo médio de resposta estável.
- Teste ponta a ponta: abrir tela externa + fazer login simultaneamente e confirmar comportamento estável.
