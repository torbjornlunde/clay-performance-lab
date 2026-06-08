create unique index if not exists training_score_sheet_scores_sheet_shooter_post_unique_idx
  on public.training_score_sheet_scores(score_sheet_id, shooter_id, post_number);

create unique index if not exists training_score_sheet_target_results_sheet_shooter_post_target_unique_idx
  on public.training_score_sheet_target_results(score_sheet_id, shooter_id, post_number, target_number);
