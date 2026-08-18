# Plano de Reformulação Visual: vMix Broadcast

O objetivo é transformar a interface atual em um painel que transmita **solidez, robustez e elegância**, seguindo uma estética "Tech Premium" inspirada em softwares de broadcast profissionais (estilo Blackmagic/ATEM), mas mantendo a clareza e o minimalismo.

## Mudanças Propostas

### 1. Novo Design do "Preview Stage" (Área de Visualização)
- **Moldura Profissional**: O preview de 16:9 terá uma borda sutil com indicadores de status integrados (Tally light virtual).
- **Console de Status Suspenso**: Informações críticas como "No Ar", "Próximo" e "Relógio" flutuarão sobre o preview com fundo em vidro fosco (glassmorphism).

### 2. Grid de Controle Robusto
- **Dashboard de Acesso Rápido**: Substituir os cards simples por um grid denso e organizado, usando a paleta Navy Deep (#0A2540) com acentos em Ciano (#00BFF0).
- **Feedback Visual Ativo**: Indicadores de nível e sinal para cada módulo (Ticker, TClock, Insert Live).

### 3. Organização de Seções (Arquitetura de Informação)
- **Fluxo Lógico**: A coluna de configurações será dividida em blocos funcionais claros:
    - **Control Center**: Ações imediatas (Atualizar GC, Insert Now).
    - **Identity & Branding**: Override de locutor e fundos.
    - **Engagement**: Redes sociais e QR Code.
- **Tipografia**: Uso consistente de *Sora* para títulos técnicos e *Manrope* para dados legíveis.

### 4. Refinamento de Componentes
- **Inputs Estilizados**: Bordas mais finas, estados de foco mais precisos e ícones minimalistas.
- **Animações Suaves**: Transições de micro-interação ao alternar abas ou salvar dados, passando a sensação de um software de alta performance.

## Detalhes Técnicos
- Implementação no arquivo `src/components/BroadcastPage.tsx`.
- Reforço do uso de variáveis de cor semânticas.
- Ajuste no componente `MockupPreview` para melhor escala em diferentes resoluções.
- Otimização do `Insert Live` para visualização mais compacta e poderosa.

---
*Este plano foca exclusivamente na interface administrativa do módulo Broadcast.*
