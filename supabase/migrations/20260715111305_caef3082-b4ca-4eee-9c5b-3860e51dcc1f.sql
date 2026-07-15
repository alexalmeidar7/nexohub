UPDATE public.user_settings
   SET dashboard_items = COALESCE(dashboard_items, '{}'::jsonb) || jsonb_build_object(
         'music_start_time', NULL,
         'music_current_title', '',
         'music_current_artist', '',
         'music_current_cover', '',
         'music_current_curiosity', ''
       ),
       updated_at = now()
 WHERE user_id = 'b2f70324-d086-4a5d-a407-cbc4acf98dce';