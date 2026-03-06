CREATE OR REPLACE FUNCTION public.copy_user_data(p_source uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Delete existing target data
  DELETE FROM apresentadores WHERE user_id = p_target;
  DELETE FROM agenda_participantes WHERE user_id = p_target;
  DELETE FROM agenda_eventos WHERE user_id = p_target;
  DELETE FROM logos_patrocinadores WHERE user_id = p_target;
  DELETE FROM programas WHERE user_id = p_target;
  DELETE FROM streaming_channels WHERE user_id = p_target;
  DELETE FROM comercial_preroll WHERE user_id = p_target;
  DELETE FROM custom_news_sites WHERE user_id = p_target;
  DELETE FROM selected_news WHERE user_id = p_target;
  DELETE FROM escalada_news WHERE user_id = p_target;
  DELETE FROM selected_cotacoes WHERE user_id = p_target;
  DELETE FROM testemunhais WHERE user_id = p_target;
  DELETE FROM promocoes WHERE user_id = p_target;
  DELETE FROM shopping_products WHERE user_id = p_target;
  DELETE FROM user_settings WHERE user_id = p_target;
  DELETE FROM client_modules WHERE user_id = p_target;

  -- Copy apresentadores
  INSERT INTO apresentadores (user_id, nome, cargo, foto, instagram, ativo)
  SELECT p_target, nome, cargo, foto, instagram, ativo FROM apresentadores WHERE user_id = p_source;

  -- Copy programas (need to map apresentador_id)
  INSERT INTO programas (user_id, nome, descricao, capa, selo, estudio, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo)
  SELECT p_target, nome, descricao, capa, selo, estudio, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo FROM programas WHERE user_id = p_source;

  -- Copy streaming_channels
  INSERT INTO streaming_channels (user_id, name, url, type, cover_url, background_url, numero_canal, logo_url, active)
  SELECT p_target, name, url, type, cover_url, background_url, numero_canal, logo_url, active FROM streaming_channels WHERE user_id = p_source;

  -- Copy comercial_preroll
  INSERT INTO comercial_preroll (user_id, horario_inicio, horario_fim, video_url, youtube_url, link_url, media_type, priority, active, skip_enabled, dias_semana, data_inicial, data_final)
  SELECT p_target, horario_inicio, horario_fim, video_url, youtube_url, link_url, media_type, priority, active, skip_enabled, dias_semana, data_inicial, data_final FROM comercial_preroll WHERE user_id = p_source;

  -- Copy custom_news_sites
  INSERT INTO custom_news_sites (user_id, name, rss_url)
  SELECT p_target, name, rss_url FROM custom_news_sites WHERE user_id = p_source;

  -- Copy selected_news
  INSERT INTO selected_news (user_id, portal, title, image_url)
  SELECT p_target, portal, title, image_url FROM selected_news WHERE user_id = p_source;

  -- Copy escalada_news
  INSERT INTO escalada_news (user_id, portal, title, image_url)
  SELECT p_target, portal, title, image_url FROM escalada_news WHERE user_id = p_source;

  -- Copy selected_cotacoes
  INSERT INTO selected_cotacoes (user_id, name, value, change)
  SELECT p_target, name, value, change FROM selected_cotacoes WHERE user_id = p_source;

  -- Copy testemunhais
  INSERT INTO testemunhais (user_id, texto, imagem_url, data_inicio, data_fim)
  SELECT p_target, texto, imagem_url, data_inicio, data_fim FROM testemunhais WHERE user_id = p_source;

  -- Copy promocoes
  INSERT INTO promocoes (user_id, texto, imagem_url, oferecimento, botao_url, data_inicio, data_fim)
  SELECT p_target, texto, imagem_url, oferecimento, botao_url, data_inicio, data_fim FROM promocoes WHERE user_id = p_source;

  -- Copy shopping_products
  INSERT INTO shopping_products (user_id, name, description, price, stock, image_url, payment_url, active)
  SELECT p_target, name, description, price, stock, image_url, payment_url, active FROM shopping_products WHERE user_id = p_source;

  -- Copy user_settings
  INSERT INTO user_settings (user_id, music_xml_url)
  SELECT p_target, music_xml_url FROM user_settings WHERE user_id = p_source;

  -- Copy client_modules
  INSERT INTO client_modules (user_id, module_key, enabled)
  SELECT p_target, module_key, enabled FROM client_modules WHERE user_id = p_source;

  -- Update empresa_config (keep target's user_id but copy other fields)
  UPDATE empresa_config SET
    logo = s.logo, background_url = s.background_url, endereco = s.endereco,
    telefone_comercial = s.telefone_comercial, telefone_participacao = s.telefone_participacao,
    site = s.site, facebook = s.facebook, instagram = s.instagram, youtube = s.youtube
  FROM empresa_config s
  WHERE empresa_config.user_id = p_target AND s.user_id = p_source;
END;
$$;

-- Execute the copy
SELECT public.copy_user_data(
  'e4e56fbb-0e90-4664-90b9-fbcb4ba9f637'::uuid,
  'ba0ca6e3-4a8a-4607-ba48-4f7a86996760'::uuid
);

-- Drop the function after use
DROP FUNCTION public.copy_user_data;