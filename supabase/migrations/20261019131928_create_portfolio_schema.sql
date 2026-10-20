-- Applied to Supabase as migration version 20261019131928.
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  created_at timestamptz not null default now()
);

create table public.site_content (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text not null,
  technologies text[] not null default '{}',
  preview_image_path text,
  live_url text check (live_url is null or live_url ~* '^https?://'),
  repository_url text check (repository_url is null or repository_url ~* '^https?://'),
  completed_at date,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  issuer text,
  issue_date date,
  credential_url text check (credential_url is null or credential_url ~* '^https?://'),
  pdf_path text,
  preview_image_path text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  link_type text not null check (link_type in ('email', 'linkedin', 'github', 'website', 'other')),
  url text not null,
  icon_name text not null default 'link',
  sort_order integer not null default 0,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_links_url_format check (
    (link_type = 'email' and url ~* '^mailto:[^[:space:]]+@[^[:space:]]+\.[^[:space:]]+$')
    or (link_type <> 'email' and url ~* '^https?://')
  ),
  constraint contact_links_url_unique unique (url)
);

create index projects_published_sort_idx
  on public.projects (sort_order, completed_at desc)
  where is_published;

create index certificates_published_sort_idx
  on public.certificates (sort_order, issue_date desc)
  where is_published;

create index contact_links_public_sort_idx
  on public.contact_links (sort_order)
  where is_public;

create or replace function public.is_admin()
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

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger certificates_set_updated_at
  before update on public.certificates
  for each row execute function public.set_updated_at();

create trigger contact_links_set_updated_at
  before update on public.contact_links
  for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;
alter table public.site_content enable row level security;
alter table public.projects enable row level security;
alter table public.certificates enable row level security;
alter table public.contact_links enable row level security;

revoke all on table
  public.user_roles,
  public.site_content,
  public.projects,
  public.certificates,
  public.contact_links
from public, anon, authenticated;

grant select on table
  public.user_roles,
  public.site_content,
  public.projects,
  public.certificates,
  public.contact_links
to anon, authenticated;

grant insert, update, delete on table
  public.site_content,
  public.projects,
  public.certificates,
  public.contact_links
to authenticated;

create policy "Users can read their own role; admins can read all roles"
  on public.user_roles
  for select
  to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "Public can read public site content"
  on public.site_content
  for select
  to anon, authenticated
  using (is_public or (select public.is_admin()));

create policy "Admins can manage site content"
  on public.site_content
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Public can read published projects"
  on public.projects
  for select
  to anon, authenticated
  using (is_published or (select public.is_admin()));

create policy "Admins can manage projects"
  on public.projects
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Public can read published certificates"
  on public.certificates
  for select
  to anon, authenticated
  using (is_published or (select public.is_admin()));

create policy "Admins can manage certificates"
  on public.certificates
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Public can read public contact links"
  on public.contact_links
  for select
  to anon, authenticated
  using (is_public or (select public.is_admin()));

create policy "Admins can manage contact links"
  on public.contact_links
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'portfolio-assets',
  'portfolio-assets',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can read portfolio assets"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'portfolio-assets');

create policy "Admins can upload portfolio assets"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'portfolio-assets' and (select public.is_admin()));

create policy "Admins can update portfolio assets"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'portfolio-assets' and (select public.is_admin()))
  with check (bucket_id = 'portfolio-assets' and (select public.is_admin()));

create policy "Admins can delete portfolio assets"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'portfolio-assets' and (select public.is_admin()));
