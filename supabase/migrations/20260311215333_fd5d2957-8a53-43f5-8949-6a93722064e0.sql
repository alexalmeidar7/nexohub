INSERT INTO streaming_channels (user_id, name, type, url, numero_canal, active, is_hd, is_stereo, cover_url, logo_url, background_url, catalog_name, classificacao_etaria)
SELECT 
  'd17e65af-e407-466f-9b60-b55c43399513',
  name, type, url, numero_canal, active, is_hd, is_stereo, cover_url, logo_url, background_url, catalog_name, classificacao_etaria
FROM streaming_channels
WHERE user_id = 'e4e56fbb-0e90-4664-90b9-fbcb4ba9f637';