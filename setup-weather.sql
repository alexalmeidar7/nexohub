-- Setup weather configuration for Jornal FM / Transmissão
-- This file inserts weather city and coordinates into user_settings table

INSERT INTO public.user_settings (user_id, weather_city, weather_lat, weather_lon)
VALUES ('98365ea6-0ebf-496d-83e9-69b38089586d', 'Goiânia', -15.7942, -48.0676)
ON CONFLICT (user_id) DO UPDATE SET
  weather_city = 'Goiânia',
  weather_lat = -15.7942,
  weather_lon = -48.0676,
  updated_at = NOW();

-- Verify the settings were saved
SELECT user_id, weather_city, weather_lat, weather_lon, updated_at
FROM public.user_settings
WHERE user_id = '98365ea6-0ebf-496d-83e9-69b38089586d';
