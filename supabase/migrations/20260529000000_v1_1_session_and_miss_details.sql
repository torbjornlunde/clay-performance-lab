alter table public.sessions add column if not exists leirdue_result_url text;

alter table public.misses add column if not exists first_where_miss text;
alter table public.misses add column if not exists first_main_reason text;
alter table public.misses add column if not exists first_target_read text;
alter table public.misses add column if not exists first_comment text;
alter table public.misses add column if not exists second_where_miss text;
alter table public.misses add column if not exists second_main_reason text;
alter table public.misses add column if not exists second_target_read text;
alter table public.misses add column if not exists second_comment text;
