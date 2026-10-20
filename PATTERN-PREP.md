# Pattern prep + Social posts — workflow for a new AI session

Dashboard (Cloudflare Worker + D1 + R2, no framework). Per-site settings: `site.config.js`. Roles: **admin** (owner), **editor** (employee), **writer**.

## Pages
| Route | What |
|---|---|
| `/dashboard/prep` | Pattern prep list, admin "New project cards" box, status chips |
| `/dashboard/prep/<id>` | The card: 5 steps (originals → pattern info → template → prompts → generated images) + one "Save card" |
| `/dashboard/social` | Social board: one cell per article image, F/P halves, filters, indexed checkbox |
| `/dashboard/social/card/<slug>/<n>` | Card page: FB + Pin image, texts, "Mark as posted" (dated log), "Mark as wrong" |
| `/dashboard/social/bulk` | Pinterest bulk-upload CSV builder |
| `/dashboard/social/export.csv` | Team posting log |
| `/dashboard/social/templates` | Gallery of the 11 templates |
| `/dashboard/articles` | Articles the board works from (hero = image 1) |
| `/dashboard/users` | Admin only |

Status flow of a prep card (automatic on every save, may jump steps): `new → filled → prompted → ready → published`.
`filled` = (info or title) + ≥1 original photo · `prompted` = prompts exist · `ready` = generated images ≥ min(5, prompts) · `published` = admin sets the article slug.

## CLI (run from this project folder; needs `.cli.env` with `CLI_URL` and `CLI_TOKEN`)
```
node tools/prep-cards.mjs list [status]
node tools/prep-cards.mjs show <id> [outDir]        # prints info + downloads every original/generated image
node tools/prep-cards.mjs genprompts <id> [n]       # rules-based prompts, 5-10
node tools/prep-cards.mjs prompts <id> <file.txt>   # hand-written prompts ("## Shot name" blocks)
node tools/prep-cards.mjs status <id> <status> [slug]
node tools/prep-cards.mjs create <titles.txt>       # one card per line (URL lines work)

node tools/social-cards.mjs <slug> [--force] [--retext] [--template=key]
node tools/social-cards.mjs --all
node tools/social-cards.mjs --samples
```
The CLIs call `/api/cli/ping` first and **refuse to run if the dashboard's `siteId` differs from `site.config.js`**.
The renderer needs Chrome or Edge (auto-detected, or set `CHROME_PATH`).

## Writer: "card X is ready" → published article
1. `node tools/prep-cards.mjs show X` — read the info and **look at every image** (drop generated images that changed the project: other stitches, colours, shape).
2. Optimise the images and put them in the site's image folder (hero = generated image 1). If the site is served by this Worker, upload with the API: `PUT /api/cli/upload?key=images/<file>.jpg` (see `tools/api.mjs` → `upload`).
3. Write the article in the site's usual format and publish it.
4. Register it for the board: `POST /api/cli/articles` with `{slug,title,description,type,skill,yarn,hook,time,images:[{url,alt}],social_template,published_at}` (or edit it in `/dashboard/articles`). Copy the card's template into `social_template`.
5. `node tools/prep-cards.mjs status X published <slug>` (attaches the slug).
6. `node tools/social-cards.mjs <slug>` — renders the FB (1080×1350) and Pin (1000×1500) images and fills the texts. Texts edited in the dashboard are kept unless `--retext`; existing images are skipped unless `--force`. Optional per-article overrides: `tools/social-overrides/<slug>.json` → `{"*":{...}, "2":{"pin_title":"..."}}`.
7. Deploy the site.

### Quality rules for crochet articles
US terms (UK equivalents where useful), materials list, skill level, gauge, finished size, abbreviations, a full row-by-row / round-by-round pattern copied **faithfully** from the card — never invent rounds or stitch counts (ask if something is missing) — tips, variations, care, FAQ. Add HowTo/Article + FAQ schema if the site uses schema. Don't claim AI images are "my photo"; don't invent testimonials, numbers or awards.

## Rules that must not be broken
- Template keys (`classic, split, magazine, polaroid, pattern-card, yarn-ball, collage, minimal, bold, materials, stitch-guide`) are stored in the DB — never rename one.
- Database: only add tables/columns (migrations folder). Never drop or rewrite existing data without asking the owner.
- Facebook caption has hashtags and **no link**; the article link goes in the first comment. Pin description never contains the domain.
- Secrets are set by the owner (`wrangler secret put`), never written to files.
