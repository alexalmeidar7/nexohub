INSERT INTO public.available_modules (key, name, description, icon) VALUES
  ('vmix', 'Módulo vMix', 'Broadcast, cenários e controle vMix', 'Video'),
  ('sorteios', 'Módulo Sorteios', 'Sorteios e prêmios', 'Gift'),
  ('blitz', 'Módulo Blitz', 'Blitz promocionais', 'Zap'),
  ('site', 'Módulo Site', 'Painel administrativo do site', 'Globe'),
  ('cortevideo', 'Módulo Ferramentas — Corte de Vídeo', 'Editor e cortes de vídeo', 'Scissors'),
  ('ouvintes', 'Módulo Cadastro de Ouvintes', 'Cadastro e pontuação de ouvintes', 'Users')
ON CONFLICT (key) DO NOTHING;