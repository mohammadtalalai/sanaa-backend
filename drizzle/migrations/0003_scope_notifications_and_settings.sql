DROP POLICY IF EXISTS "signed in read" ON public.notifications;
DROP POLICY IF EXISTS "signed in mark read" ON public.notifications;
CREATE POLICY "staff read" ON public.notifications FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_platform_admin());
CREATE POLICY "staff mark read" ON public.notifications FOR UPDATE TO authenticated
  USING (public.is_staff() OR public.is_platform_admin())
  WITH CHECK (public.is_staff() OR public.is_platform_admin());
REVOKE UPDATE ON public.notifications FROM authenticated;
GRANT UPDATE (read) ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "signed in read" ON public.factory_settings;
CREATE POLICY "staff read" ON public.factory_settings FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_platform_admin());