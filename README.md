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
   - `LEIRDUE_REFRESH_SECRET` or `CRON_SECRET` in Vercel Production so the daily Vercel Cron request to `/api/leirdue/refresh-recent` stays protected. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is configured; the route also accepts `LEIRDUE_REFRESH_SECRET` through the same bearer value or `x-cron-secret` for supported server-side schedulers.
7. Deploy.
