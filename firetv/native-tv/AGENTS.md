# Nexo TV nativo — instruções obrigatórias do módulo

Antes de editar qualquer tela, fluxo, mídia ou recurso neste módulo, ler integralmente [NEXO_TV_ESPECIFICACAO_NATIVA.md](NEXO_TV_ESPECIFICACAO_NATIVA.md). As regras do AGENTS.md raiz continuam aplicáveis.

- Fonte visual única: Lote 16, commit ab4c488a9f88a46c677e6e1ee108b86ca7c78fbe. Não usar os pilotos rejeitados como referência de layout.
- Implementar Kotlin/Compose/Media3 sem WebView; reproduzir o design, assets, fontes, glassmorphism e todos os estados, sem substituições simplificadas.
- Não alterar o aplicativo legado, HMO/HMD ou infraestrutura sem solicitação específica.
- Antes de declarar qualquer tela concluída, comparar capturas 1920×1080 da referência e da implementação com os mesmos dados e foco. Anexar evidências reais, registrar divergências e corrigir. Capturas em TV física e testes de desempenho são obrigatórios antes da entrega final.
- Um build verde autoriza apenas teste técnico, não certifica paridade. Sem evidência, marcar como pendente. Manter PR #327 em rascunho até aprovação.
- Nenhuma tarefa deve ser repassada ao usuário como instrução de desenvolvimento. Implementar no próprio módulo, manter os dois flavors e preservar o APK anterior.
