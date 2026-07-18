# Environment variables

## Beta approval email

Approval emails use Resend and the same email template for real approvals, resends, and the admin test email on `/beta/admin`.

Required for approval email delivery:

```bash
RESEND_API_KEY="re_..."
BETA_APPROVAL_EMAIL_FROM="Clay Performance Lab <beta@clayperformancelab.com>"
NEXT_PUBLIC_SITE_URL="https://clayperformancelab.com"
```

Optional fallback:

```bash
ADMIN_ALERT_EMAIL_FROM="Clay Performance Lab <alerts@clayperformancelab.com>"
```

`ADMIN_ALERT_EMAIL_FROM` can be used as a sender fallback if `BETA_APPROVAL_EMAIL_FROM` is not set, but production deployments should configure `BETA_APPROVAL_EMAIL_FROM` so beta approval email has a dedicated sender.

Notes:

- Never expose `RESEND_API_KEY` in client code. The admin UI only shows whether it exists.
- The sender domain/address must be verified in Resend before Resend will accept the email.
- `NEXT_PUBLIC_SITE_URL` is used to build the login/signup link in approval emails. Do not include a trailing path; use the site origin.
- Vercel deployments must be redeployed after environment variable changes.
- Beta access approval still grants access if email delivery fails; the admin UI and the interest row email status show the email error so an admin can fix configuration and resend.

## Beta admin last sign-in

`/beta/admin` can display Supabase Auth `last_sign_in_at` values through the server-side `/api/beta-admin/last-sign-ins` endpoint.

Required for last sign-in display:

```bash
SUPABASE_SERVICE_ROLE_KEY="..."
```

Notes:

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in client code. The beta admin page calls a server route that first verifies the signed-in admin with normal Supabase auth and access-profile checks.
- If the service-role key is not configured, the inbox shows `Last sign-in unavailable` instead of querying Auth data from the browser.
- TODO: If Auth admin metadata is not enough for future operations, add a small activity field such as `user_access_profiles.last_seen_at` or a dedicated `app_user_activity.last_seen_at` in a future PR.
