# Plano para Correção da Exibição de Promoções e Citações

O usuário relatou que as promoções já cadastradas não estão sendo exibidas. A investigação indica que o problema está relacionado ao isolamento de dados entre o usuário principal (master) e os subusuários. Embora existam políticas de segurança (RLS) que permitem o acesso, os componentes `PromocoesPage.tsx` e `TestemunhaisPage.tsx` dependem do `effectiveUserId` passado pelo `Dashboard.tsx` para filtrar os dados no frontend.

## Alterações propostas

### 1. Componente Dashboard
- Verificar a lógica de inicialização do `effectiveUserId`.
- Garantir que para subusuários, o `effectiveUserId` seja corretamente extraído da tabela `sub_users` e mantido no estado global do dashboard para ser repassado aos subcomponentes.

### 2. Componentes de Listagem (Promoções e Citações)
- Garantir que a query de busca (`loadData`) utilize o `effectiveUserId` quando disponível.
- Adicionar logs de depuração temporários para verificar qual ID está sendo usado na consulta ao banco de dados.
- Restaurar as mensagens de lista vazia padrão ("Nenhuma promoção cadastrada" e "Nenhuma citação cadastrada") que foram alteradas para mensagens de depuração nos turnos anteriores.

## Detalhes técnicos
- O `effectiveUserId` deve ser o `parent_user_id` quando o usuário logado for um subusuário.
- A consulta `supabase.from("promocoes").select("*").eq("user_id", ownerId)` deve retornar dados se o `ownerId` for o ID do usuário que criou os registros (o master).
- RLS: As políticas `"Sub-users manage parent promocoes"` e `"Sub-users manage parent testemunhais"` já existem e permitem o acesso, então o problema é puramente a passagem do ID correto no frontend.
