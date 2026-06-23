## Novo módulo: Site

Criar um item "site" no menu lateral (abaixo de "player") que abre um painel de administração de um site público da rádio, com mockup ao vivo + controles laterais.

### 1. Menu (src/components/Dashboard.tsx)
- Adicionar item `{ icon: Globe, label: "site", page: "site" }` logo abaixo do item player.
- Registrar a página `site` para renderizar o novo componente `SitePage`.

### 2. Backend (migração)
Criar tabelas para guardar a configuração e o conteúdo do site, com RLS por `user_id` + GRANTs.

- `site_config` — uma linha por usuário. Toggles do que exibe e meta do site:
  - `user_id` (pk, fk profiles), `site_nome`, `site_descricao`, `cor_primaria`,
  - `show_noticias`, `show_clima`, `show_economia`, `show_promocoes`, `show_grade`, `show_no_ar`,
  - `fonte_noticias` enum: `"roteiro" | "manual"`,
  - `cidade_clima`, `cidade_lat`, `cidade_lon`,
  - `updated_at`.
- `site_noticias` — notícias manuais: `id`, `user_id`, `categoria_id`, `titulo`, `resumo`, `conteudo`, `imagem_url`, `publicado`, `created_at`.
- `site_categorias` — categorias de notícias: `id`, `user_id`, `nome`, `slug`, `cor`, `ordem`.

Políticas: usuário lê/escreve apenas suas próprias linhas (auth.uid()). Leitura pública (anon) liberada nas três para alimentar a página pública futuramente. GRANTs explícitos.

### 3. Componentes (frontend)

`src/components/site/SitePage.tsx` — layout principal em 2 colunas:
- **Esquerda (≈ 65%)**: `SiteMockup` — preview do site renderizado dentro de um frame estilo "browser" (barra com bolinhas + URL fake). Reage em tempo real às toggles.
- **Direita (≈ 35%)**: painel `SiteAdminPanel` com seções colapsáveis seguindo o padrão visual já usado em Roteiro de Programa (card translúcido + chevron + ícone em accent):
  1. Identidade (nome, descrição)
  2. Seções visíveis (switches: No Ar, Notícias, Clima, Economia, Promoções, Grade)
  3. Notícias → escolher fonte (último roteiro jornalístico vs. manual) + CRUD básico de notícias manuais + gestão de categorias
  4. Clima → cidade (reaproveitar `fetch-weather` geocode existente)
  5. Publicar (mostra URL pública `/{slug}/site`)

`src/components/site/SiteMockup.tsx` — renderiza:
- Header com nome do site + "No Ar agora" (lê de `MusicaNoAr`/programa atual já disponível).
- Bloco Notícias: se fonte = roteiro, busca último `roteiros` do tipo jornalístico do usuário e extrai manchetes; senão lista `site_noticias`.
- Widget Clima usando `fetch-weather` (mesmo padrão de `WeatherWidget`).
- Widget Economia usando edge function `fetch-stocks` já existente.
- Lista de Promoções vigentes (de `promocoes` com data_fim >= hoje).
- Grade de programação com destaque no programa atual (de `programas` por horário).

`src/components/site/SiteNoticiasManager.tsx` e `SiteCategoriasManager.tsx` — formulários simples para CRUD, seguindo padrão de Manual Save dos formulários complexos.

### 4. Hook
`src/hooks/useSiteConfig.ts` — carrega/salva `site_config` do usuário efetivo (respeitando multi-tenant slug → `effectiveUserId`), com debounce de 500 ms ao alterar toggles.

### 5. Estilo
Sem cores hardcoded — usar tokens do tema (`--layout-accent-color`, `--layout-page-text`) como nas outras seções. Switches do shadcn, cards com fundo `color-mix(...)`. Sem verde fixo.

### Detalhes técnicos
- Reaproveita edge functions existentes: `fetch-weather`, `fetch-stocks`, sem novas funções nesta etapa.
- Página pública do site (`/:userSlug/site`) **não** entra nesta etapa — só o admin com mockup. Adicionamos depois caso confirme.
- `effectiveUserId` segue regra multi-tenant já estabelecida (slug na URL sobrepõe auth).

### Fora do escopo desta etapa
- Tema/templates múltiplos para o site público.
- SEO/metatags do site público.
- Domínio personalizado.