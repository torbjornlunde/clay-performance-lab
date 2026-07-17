-- Add private screenshot/image attachments for internal beta feedback.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beta-feedback-attachments',
  'beta-feedback-attachments',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create table if not exists public.beta_feedback_attachments (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.beta_feedback(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  storage_bucket text not null default 'beta-feedback-attachments',
  storage_path text not null,
  original_filename text,
  content_type text,
  size_bytes integer,
  created_at timestamptz not null default now(),
  constraint beta_feedback_attachments_bucket_check check (storage_bucket = 'beta-feedback-attachments'),
  constraint beta_feedback_attachments_content_type_check check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  constraint beta_feedback_attachments_size_check check (size_bytes is null or (size_bytes > 0 and size_bytes <= 5242880)),
  constraint beta_feedback_attachments_storage_path_unique unique (storage_bucket, storage_path)
);

create index if not exists beta_feedback_attachments_feedback_id_idx
  on public.beta_feedback_attachments(feedback_id, created_at asc);
create index if not exists beta_feedback_attachments_user_id_idx
  on public.beta_feedback_attachments(user_id, created_at desc);

alter table public.beta_feedback_attachments enable row level security;

drop policy if exists "beta_feedback_attachments_insert_own" on public.beta_feedback_attachments;
create policy "beta_feedback_attachments_insert_own" on public.beta_feedback_attachments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and storage_bucket = 'beta-feedback-attachments'
    and exists (
      select 1 from public.beta_feedback feedback
      where feedback.id = feedback_id
        and feedback.user_id = auth.uid()
    )
  );

drop policy if exists "beta_feedback_attachments_select_own" on public.beta_feedback_attachments;
create policy "beta_feedback_attachments_select_own" on public.beta_feedback_attachments
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "beta_feedback_attachments_admin_select" on public.beta_feedback_attachments;
create policy "beta_feedback_attachments_admin_select" on public.beta_feedback_attachments
  for select to authenticated
  using (public.is_access_admin());

drop policy if exists "beta_feedback_storage_insert_own" on storage.objects;
create policy "beta_feedback_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'beta-feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "beta_feedback_storage_select_own" on storage.objects;
create policy "beta_feedback_storage_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'beta-feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "beta_feedback_storage_admin_select" on storage.objects;
create policy "beta_feedback_storage_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'beta-feedback-attachments' and public.is_access_admin());

comment on table public.beta_feedback_attachments is 'Private screenshot/image attachments for internal closed beta feedback.';
