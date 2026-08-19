update public.user_settings
set dashboard_items = coalesce(dashboard_items, '{}'::jsonb) || jsonb_build_object(
  'music_current_title', 'Evidências',
  'music_current_artist', 'Chitãozinho & Xororó',
  'music_current_duration', 272,
  'music_start_time', (extract(epoch from now()) * 1000)::bigint - 45000
)
where user_id = 'd17e65af-e407-466f-9b60-b55c43399513';