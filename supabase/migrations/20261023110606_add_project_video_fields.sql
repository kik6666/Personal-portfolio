alter table public.projects
  add column video_path text,
  add column video_url text,
  add constraint projects_video_source_check
    check (video_path is null or video_url is null),
  add constraint projects_video_url_protocol_check
    check (video_url is null or video_url ~* '^https?://');
