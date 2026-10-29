
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
$$;

CREATE TABLE public.admin_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL,
 recipient_id uuid, subject text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '',
 is_broadcast boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage messages" ON public.admin_messages FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin'::public.app_role))
 WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE POLICY "Users view own messages" ON public.admin_messages FOR SELECT TO authenticated
 USING (recipient_id=auth.uid() OR is_broadcast=true);

CREATE TABLE public.audiencia_historico (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, programa text,
 audio integer NOT NULL DEFAULT 0, video integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audiencia_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant audiencia access" ON public.audiencia_historico FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX idx_audiencia_historico_user_created ON public.audiencia_historico(user_id,created_at DESC);

CREATE TABLE public.cenario_estudio_grupos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 nome text NOT NULL DEFAULT 'Novo grupo', rows integer NOT NULL DEFAULT 1,
 cols integer NOT NULL DEFAULT 1, programa_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cenario_estudio_grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant groups access" ON public.cenario_estudio_grupos FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX idx_cenario_estudio_grupos_user ON public.cenario_estudio_grupos(user_id);
CREATE INDEX idx_cenario_estudio_grupos_programas ON public.cenario_estudio_grupos USING GIN(programa_ids);
CREATE TRIGGER update_cenario_estudio_grupos_updated_at BEFORE UPDATE ON public.cenario_estudio_grupos
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cenario_estudio_tvs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 grupo_id uuid NOT NULL REFERENCES public.cenario_estudio_grupos(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, posicao integer NOT NULL DEFAULT 0, imagem_url text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(grupo_id,posicao)
);
ALTER TABLE public.cenario_estudio_tvs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant tv access" ON public.cenario_estudio_tvs FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX idx_cenario_estudio_tvs_grupo ON public.cenario_estudio_tvs(grupo_id);
CREATE TRIGGER update_cenario_estudio_tvs_updated_at BEFORE UPDATE ON public.cenario_estudio_tvs
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.custom_vmix_buttons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 nome text NOT NULL DEFAULT '', dias_semana text[] DEFAULT '{}', horario text DEFAULT '',
 commands jsonb NOT NULL DEFAULT '[]'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_vmix_buttons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant custom vmix buttons" ON public.custom_vmix_buttons FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());

CREATE TABLE public.vmix_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, name text NOT NULL,
 url text NOT NULL, username text, password text, is_default boolean DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vmix_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant vmix connections" ON public.vmix_connections FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX idx_vmix_connections_user_id ON public.vmix_connections(user_id);
CREATE OR REPLACE FUNCTION public.handle_vmix_connections_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER set_vmix_connections_updated_at BEFORE UPDATE ON public.vmix_connections
 FOR EACH ROW EXECUTE FUNCTION public.handle_vmix_connections_updated_at();

CREATE TABLE public.ouvintes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, nome text NOT NULL,
 cpf text, telefone text, email text, setor text, cidade text, data_nascimento date,
 escolaridade text, renda text, pontuacao numeric DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ouvintes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant ouvintes" ON public.ouvintes FOR ALL TO authenticated
 USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE INDEX idx_ouvintes_user_id ON public.ouvintes(user_id);
CREATE TRIGGER update_ouvintes_updated_at BEFORE UPDATE ON public.ouvintes
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.player_chat_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id text NOT NULL,
 nome text NOT NULL, cidade text NOT NULL, message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.player_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read player chat" ON public.player_chat_messages FOR SELECT USING(true);
CREATE POLICY "Insert player chat" ON public.player_chat_messages FOR INSERT WITH CHECK(true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_chat_messages;
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN DELETE FROM public.player_chat_messages WHERE created_at < now()-interval '24 hours'; END; $$;

CREATE TABLE public.site_config (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 site_nome text NOT NULL DEFAULT 'Meu Site', site_descricao text DEFAULT '',
 cor_primaria text DEFAULT '#268ffa', show_no_ar boolean NOT NULL DEFAULT true,
 show_noticias boolean NOT NULL DEFAULT true, show_clima boolean NOT NULL DEFAULT true,
 show_economia boolean NOT NULL DEFAULT true, show_promocoes boolean NOT NULL DEFAULT true,
 show_grade boolean NOT NULL DEFAULT true,
 fonte_noticias text NOT NULL DEFAULT 'roteiro' CHECK(fonte_noticias IN ('roteiro','manual')),
 cidade_clima text DEFAULT '', cidade_lat double precision, cidade_lon double precision,
 updated_at timestamptz NOT NULL DEFAULT now(), logo_url text DEFAULT '', favicon_url text DEFAULT '',
 meta_description text DEFAULT '', meta_keywords text DEFAULT '', og_image_url text DEFAULT '', site_dominio text DEFAULT ''
);
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read site config" ON public.site_config FOR SELECT USING(true);
CREATE POLICY "Owner manage site config" ON public.site_config FOR ALL TO authenticated
 USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE TRIGGER trg_site_config_updated_at BEFORE UPDATE ON public.site_config
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.site_categorias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 nome text NOT NULL, slug text NOT NULL, cor text DEFAULT '#268ffa', ordem integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,slug)
);
ALTER TABLE public.site_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read site categories" ON public.site_categorias FOR SELECT USING(true);
CREATE POLICY "Owner manage site categories" ON public.site_categorias FOR ALL TO authenticated
 USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);

CREATE TABLE public.site_noticias (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 categoria_id uuid REFERENCES public.site_categorias(id) ON DELETE SET NULL, titulo text NOT NULL,
 resumo text DEFAULT '', conteudo text DEFAULT '', imagem_url text DEFAULT '',
 publicado boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_noticias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published site news" ON public.site_noticias FOR SELECT USING(publicado=true OR auth.uid()=user_id);
CREATE POLICY "Owner manage site news" ON public.site_noticias FOR ALL TO authenticated
 USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE INDEX idx_site_noticias_user_pub ON public.site_noticias(user_id,publicado,created_at DESC);
CREATE TRIGGER trg_site_noticias_updated_at BEFORE UPDATE ON public.site_noticias
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.site_banners (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, nome text NOT NULL,
 image_url text NOT NULL, link_url text, posicao text NOT NULL DEFAULT 'topo',
 data_inicial date, data_final date, ativo boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage site banners" ON public.site_banners FOR ALL TO authenticated
 USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE POLICY "Public read active site banners" ON public.site_banners FOR SELECT USING(ativo=true);
CREATE TRIGGER update_site_banners_updated_at BEFORE UPDATE ON public.site_banners
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.site_deploy_config (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 protocol text NOT NULL DEFAULT 'ftp' CHECK(protocol IN ('ftp','ftps','sftp')),
 host text NOT NULL DEFAULT '', port integer NOT NULL DEFAULT 21, username text NOT NULL DEFAULT '',
 password text NOT NULL DEFAULT '', remote_path text NOT NULL DEFAULT '/public_html',
 auto_publish boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_deploy_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manage deploy config" ON public.site_deploy_config FOR ALL TO authenticated
 USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
CREATE TRIGGER trg_site_deploy_config_updated_at BEFORE UPDATE ON public.site_deploy_config
 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.site_deploy_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('success','error','running')), message text DEFAULT '',
 files_count integer DEFAULT 0, bytes_sent bigint DEFAULT 0, duration_ms integer DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_deploy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner read deploy history" ON public.site_deploy_history FOR SELECT USING(auth.uid()=user_id);
CREATE POLICY "Owner insert deploy history" ON public.site_deploy_history FOR INSERT WITH CHECK(auth.uid()=user_id);
CREATE INDEX idx_deploy_history_user_date ON public.site_deploy_history(user_id,created_at DESC);
