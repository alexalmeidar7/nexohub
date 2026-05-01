-- Create vmix_connections table without hard foreign key to auth.users if causing issues in this environment, 
-- but using UUID to match. Usually auth.users is available. 
-- The error 23503 suggests the user_id in user_settings doesn't exist in auth.users yet? 
-- Let's try creating the table and migrating data more safely.

CREATE TABLE IF NOT EXISTS public.vmix_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    username TEXT,
    password TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.vmix_connections ENABLE ROW LEVEL SECURITY;

-- Policies (using auth.uid() which works if users exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own vmix connections') THEN
        CREATE POLICY "Users can view their own vmix connections"
            ON public.vmix_connections FOR SELECT
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert their own vmix connections') THEN
        CREATE POLICY "Users can insert their own vmix connections"
            ON public.vmix_connections FOR INSERT
            WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update their own vmix connections') THEN
        CREATE POLICY "Users can update their own vmix connections"
            ON public.vmix_connections FOR UPDATE
            USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own vmix connections') THEN
        CREATE POLICY "Users can delete their own vmix connections"
            ON public.vmix_connections FOR DELETE
            USING (auth.uid() = user_id);
    END IF;
END
$$;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_vmix_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_vmix_connections_updated_at ON public.vmix_connections;
CREATE TRIGGER set_vmix_connections_updated_at
    BEFORE UPDATE ON public.vmix_connections
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_vmix_connections_updated_at();

-- Add index
CREATE INDEX IF NOT EXISTS idx_vmix_connections_user_id ON public.vmix_connections(user_id);
