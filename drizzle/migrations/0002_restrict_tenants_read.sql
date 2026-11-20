DROP POLICY IF EXISTS "signed in read" ON public.tenants;
CREATE POLICY "admin read" ON public.tenants FOR SELECT TO authenticated USING (public.is_platform_admin());