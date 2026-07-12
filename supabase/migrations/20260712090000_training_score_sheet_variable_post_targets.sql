create or replace function public.valid_expected_targets_by_post(value jsonb, expected_posts integer)
returns boolean
language sql
immutable
as $$
  select value is null
    or (
      jsonb_typeof(value) = 'array'
      and jsonb_array_length(value) = expected_posts
      and not exists (
        select 1
        from jsonb_array_elements(value) as item(raw)
        where jsonb_typeof(item.raw) <> 'number'
          or (item.raw #>> '{}')::integer < 1
          or (item.raw #>> '{}')::integer > 100
      )
    );
$$;

alter table public.training_score_sheets
  add column if not exists expected_targets_by_post jsonb;

alter table public.training_score_sheets
  drop constraint if exists training_score_sheets_expected_targets_by_post_check;

alter table public.training_score_sheets
  add constraint training_score_sheets_expected_targets_by_post_check
  check (public.valid_expected_targets_by_post(expected_targets_by_post, number_of_posts));

comment on column public.training_score_sheets.expected_targets_by_post is
  'Optional per-post expected target counts for variable-target sporting rounds. Null preserves fixed number_of_posts × targets_per_post behavior.';
