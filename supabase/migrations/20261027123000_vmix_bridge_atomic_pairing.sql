-- Make one-time pairing consumption and device creation atomic.
-- If device insertion fails, PostgreSQL rolls back used_at so the code can be retried.

CREATE OR REPLACE FUNCTION public.connect_vmix_bridge_device(
  p_code_hash text,
  p_device_name text,
  p_token_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_pairing_id uuid;
  v_user_id uuid;
  v_device_name text;
BEGIN
  IF p_code_hash IS NULL OR p_code_hash !~ '^[0-9a-f]{64}$'
     OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid Bridge pairing payload';
  END IF;

  v_device_name := COALESCE(
    NULLIF(LEFT(BTRIM(COALESCE(p_device_name, '')), 120), ''),
    'vMix Studio'
  );

  SELECT p.id, p.user_id
    INTO v_pairing_id, v_user_id
  FROM public.vmix_bridge_pairings AS p
  WHERE p.code_hash = p_code_hash
    AND p.used_at IS NULL
    AND p.expires_at > clock_timestamp()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.vmix_bridge_pairings AS p
  SET used_at = clock_timestamp()
  WHERE p.id = v_pairing_id
    AND p.used_at IS NULL
    AND p.expires_at > clock_timestamp()
  RETURNING p.user_id INTO v_user_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.vmix_bridge_devices (
    user_id,
    device_name,
    token_hash,
    revoked,
    last_seen_at
  )
  VALUES (
    v_user_id,
    v_device_name,
    p_token_hash,
    false,
    clock_timestamp()
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.connect_vmix_bridge_device(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connect_vmix_bridge_device(text, text, text)
  TO service_role;
