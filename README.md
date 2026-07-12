# Clay Performance Lab

Next.js + Supabase MVP.

## Setup
1. Create Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Enable email/password auth in Supabase.
4. Upload all files to GitHub repo.
5. Connect repo to Vercel.
6. Add environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `CRON_SECRET` in Vercel Production for the daily Vercel Cron request to `/api/leirdue/refresh-recent`; Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when it is configured.
   - `LEIRDUE_REFRESH_SECRET` may also be set for other secure server-side callers/manual server calls, or set to the same value as `CRON_SECRET`. Do not rely on `LEIRDUE_REFRESH_SECRET` alone for Vercel Cron unless the caller actually sends that value as `Authorization: Bearer ...` or `x-cron-secret`.
7. Deploy.
