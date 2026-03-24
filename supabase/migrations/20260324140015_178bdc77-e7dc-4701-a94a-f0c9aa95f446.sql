-- Delete ALL current chat messages
DELETE FROM public.player_chat_messages;

-- Update cleanup function to delete ALL chat messages daily
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.player_chat_messages;
END;
$function$;