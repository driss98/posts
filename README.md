# Crochet dashboard (Pattern prep + Social posts)

Cloudflare Worker + D1 (database) + R2 (images). No framework. See `PATTERN-PREP.md` for the daily workflow.

## Local test
```
npm install
npm run db:local          # create tables in the local D1
copy .dev.vars.example .dev.vars   # CLI_TOKEN=any-long-random-string  (local only)
npm run dev               # http://localhost:8787  -> first visit creates the admin
# with an EMPTY local db and the server running:
npm run selftest
```
On Windows with a nearly full C: drive, set `TMP`/`TEMP`/`npm_config_cache` to another drive first.

## Deploy to Cloudflare (you run these; I never touch your account)
```
npx wrangler login
npx wrangler d1 create crochet-dashboard            # copy the database_id into wrangler.toml
npx wrangler r2 bucket create crochet-dashboard-media
npm run db:remote                                    # apply migrations to the real database
npx wrangler secret put CLI_TOKEN                    # long random string, used by tools/*.mjs
npx wrangler secret put SETUP_KEY                    # optional: needed to create the first admin
npm run deploy
```
Then open `https://<worker>.workers.dev`, create the first admin, add the editor/writer under Users.
Put the same token in `.cli.env`: `CLI_URL=https://<worker>.workers.dev` and `CLI_TOKEN=...`.
Use a custom domain (e.g. `dashboard.yoursite.com`) in the Worker's Settings → Domains & Routes; keep it private (Cloudflare Access is a good extra lock).

## Another site
Copy this folder, then edit `site.config.js` (unique `siteId`, `siteName`, `siteUrl`, `articlePath`, brand colours/fonts, boards) and `wrangler.toml` (worker name, D1 + R2 names). The CLIs refuse to talk to a dashboard whose `siteId` differs.

## Notes
- Images live in R2 and are served by the Worker at `/media/...` (uploads) and `/images/...` (social images, article images). Set `mediaBase` in `site.config.js` if you serve them from a CDN/domain instead.
- Login has no rate limiting: put the dashboard behind Cloudflare Access or add a WAF rate-limit rule on `/login`.
