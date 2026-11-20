DROP POLICY IF EXISTS "signed in read" ON public.plans;
CREATE POLICY "staff read" ON public.plans FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_platform_admin());

DROP POLICY IF EXISTS "signed in read" ON public.feature_flags;
CREATE POLICY "staff read" ON public.feature_flags FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_platform_admin());

DROP POLICY IF EXISTS "signed in read" ON public.announcements;
CREATE POLICY "staff read" ON public.announcements FOR SELECT TO authenticated
  USING (public.is_staff() OR public.is_platform_admin());