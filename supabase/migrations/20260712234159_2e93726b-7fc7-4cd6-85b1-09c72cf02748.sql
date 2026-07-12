DROP POLICY IF EXISTS "Users can delete own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can insert own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can update own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can view own google tokens" ON public.google_calendar_tokens;

CREATE POLICY "Users can view own google tokens" ON public.google_calendar_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own google tokens" ON public.google_calendar_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own google tokens" ON public.google_calendar_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own google tokens" ON public.google_calendar_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);