# Deploy — WebCentriq

Static site + one serverless function (`/api/estimate`). Designed for Vercel (zero-config).

## One-time setup

### 1. Vercel account + CLI
```bash
npm i -g vercel
vercel login
```

### 2. Import project
Option A — **dashboard** (recommended): push to GitHub, then import the repo at https://vercel.com/new — Vercel auto-detects Node + `/api` and deploys.

Option B — **CLI**:
```bash
vercel link   # creates .vercel/ locally and links to a new project
```

### 3. Environment variables (required)
See `.env.example` for the full list. Set these in the Vercel dashboard (Settings → Environment Variables → Production):

| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/ |
| `RESEND_API_KEY`    | https://resend.com/api-keys |
| `ESTIMATOR_FROM`    | `WebCentriq <estimator@webcentriq.com>` (or your verified subdomain) |
| `ESTIMATOR_SALES_TO` | `sales@webcentriq.com` (where lead notifications land) |

### 4. Verify the sending domain in Resend
1. Resend dashboard → **Domains** → Add `webcentriq.com` (or `mail.webcentriq.com` subdomain)
2. Add the 3 DNS records Resend gives you (SPF, DKIM × 2)
3. Optional but recommended: DMARC record — start with `v=DMARC1; p=none; rua=mailto:dmarc@webcentriq.com`
4. Wait for **Verified** status (5 min–2 hrs)

### 5. Connect the domain to Vercel
Vercel project → **Settings** → **Domains** → Add `webcentriq.com`. Update registrar to point at Vercel (they give you the exact A/CNAME records).

## Deploy

```bash
vercel deploy --prod
```

Or let the GitHub integration auto-deploy on every push to `main`.

## Local dev

```bash
# Static only — client JS uses a mock estimator. Fastest, no keys needed.
python3 -m http.server 4173

# Or full serverless with real API calls (needs .env.local with the keys above)
vercel dev
```

## Architecture

- **`/index.html`** — single-page marketing site
- **`/styles/*.css`** + `/js/*.js` — static assets
- **`/api/estimate.js`** — POST endpoint: validates form → Claude → emails via Resend → returns `{ ok: true }`
- **`/api/_lib/claude.js`** — Anthropic SDK call with prompt caching
- **`/api/_lib/email.js`** — Resend templates (estimate + sales notification)
- **`/robots.txt`**, **`/sitemap.xml`**, **`/llms.txt`** — SEO + LLM-crawler discovery

## Cost projection

| Volume | Anthropic (Claude Sonnet 4.6) | Resend | Total |
|---|---|---|---|
| 100 estimates/month   | ~$1   | Free     | ~$1 |
| 1,000 estimates/month | ~$10  | Free     | ~$10 |
| 10,000/month          | ~$100 | Free     | ~$100 |
| 50,000/month          | ~$500 | $20 | ~$520 |

Prompt caching on the system prompt cuts Anthropic costs ~40%.

## Pre-launch checklist

- [ ] All 4 env vars set in Vercel
- [ ] Resend domain verified (status = Verified)
- [ ] Domain pointed at Vercel
- [ ] Send yourself a test estimate — verify inbox placement (Primary, not Promotions)
- [ ] Verify `From` / reply-to in the received email match expectations
- [ ] Confirm SPF/DKIM pass in email headers (`view original` in Gmail)
- [ ] Replace Trusted-by text wordmarks with real SVG logos at `/assets/logos/*`
- [ ] Add real Google Business rating/count in the Reviews section
- [ ] Replace hairline case-study illustrations with real product screenshots
- [ ] Add named senior engineer block (photo + bio + GitHub) to the Thesis section
- [ ] Generate a proper 1200×630 OG image (`og:image` currently points at the logo PNG)
