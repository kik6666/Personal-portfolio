create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

alter policy "Users can read their own role; admins can read all roles"
  on public.user_roles
  using (user_id = (select auth.uid()) or (select private.is_admin()));

alter policy "Public can read public site content"
  on public.site_content
  using (is_public or (select private.is_admin()));

alter policy "Admins can manage site content"
  on public.site_content
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy "Public can read published projects"
  on public.projects
  using (is_published or (select private.is_admin()));

alter policy "Admins can manage projects"
  on public.projects
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy "Public can read published certificates"
  on public.certificates
  using (is_published or (select private.is_admin()));

alter policy "Admins can manage certificates"
  on public.certificates
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy "Public can read public contact links"
  on public.contact_links
  using (is_public or (select private.is_admin()));

alter policy "Admins can manage contact links"
  on public.contact_links
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

alter policy "Admins can upload portfolio assets"
  on storage.objects
  with check (bucket_id = 'portfolio-assets' and (select private.is_admin()));

alter policy "Admins can update portfolio assets"
  on storage.objects
  using (bucket_id = 'portfolio-assets' and (select private.is_admin()))
  with check (bucket_id = 'portfolio-assets' and (select private.is_admin()));

alter policy "Admins can delete portfolio assets"
  on storage.objects
  using (bucket_id = 'portfolio-assets' and (select private.is_admin()));

drop function public.is_admin();
