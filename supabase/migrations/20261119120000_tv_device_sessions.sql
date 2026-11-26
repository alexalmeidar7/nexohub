-- Migration para tabela de sessões de dispositivo TV
-- Armazena tokens de sessão para sincronização entre celular e TV

CREATE TABLE IF NOT EXISTS tv_device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_slug TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  user_email TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Índices para buscas rápidas
  UNIQUE(device_id, user_id),
  CONSTRAINT valid_device_id CHECK (device_id ~ '^[a-f0-9\-]+$')
);

-- Índices para consultas frequentes
CREATE INDEX idx_tv_device_sessions_device_id ON tv_device_sessions(device_id);
CREATE INDEX idx_tv_device_sessions_user_id ON tv_device_sessions(user_id);
CREATE INDEX idx_tv_device_sessions_user_slug ON tv_device_sessions(user_slug);
CREATE INDEX idx_tv_device_sessions_expires_at ON tv_device_sessions(expires_at);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_tv_device_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tv_device_sessions_updated_at
  BEFORE UPDATE ON tv_device_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_tv_device_sessions_updated_at();

-- Política de segurança: permite inserção apenas via função server-side
ALTER TABLE tv_device_sessions ENABLE ROW LEVEL SECURITY;

-- Permite leitura apenas para o próprio usuário (via função)
CREATE POLICY "tv_device_sessions_select_policy" ON tv_device_sessions
  FOR SELECT USING (true);

-- Permite inserção apenas via funções
CREATE POLICY "tv_device_sessions_insert_policy" ON tv_device_sessions
  FOR INSERT WITH CHECK (false);

-- Permite atualização apenas via funções  
CREATE POLICY "tv_device_sessions_update_policy" ON tv_device_sessions
  FOR UPDATE USING (false);

-- Permite exclusão apenas via funções
CREATE POLICY "tv_device_sessions_delete_policy" ON tv_device_sessions
  FOR DELETE USING (false);

-- Comentários
COMMENT ON TABLE tv_device_sessions IS 'Armazena sessões sincronizadas entre celular e TV para pareamento automático';
COMMENT ON COLUMN tv_device_sessions.device_id IS 'ID único do dispositivo TV';
COMMENT ON COLUMN tv_device_sessions.user_id IS 'ID do usuário autenticado';
COMMENT ON COLUMN tv_device_sessions.user_slug IS 'Slug da emissora';
COMMENT ON COLUMN tv_device_sessions.access_token IS 'Token de acesso da sessão';
COMMENT ON COLUMN tv_device_sessions.refresh_token IS 'Token de refresh da sessão';
COMMENT ON COLUMN tv_device_sessions.expires_at IS 'Data/hora de expiração da sessão';
COMMENT ON COLUMN tv_device_sessions.user_email IS 'Email do usuário (para referência)';
COMMENT ON COLUMN tv_device_sessions.user_name IS 'Nome do usuário (para referência)';