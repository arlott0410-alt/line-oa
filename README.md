# LineUnifiedInbox

A production-ready MVP web app that aggregates all incoming chats from **one Line Official Account (Line OA)** into a single-window dashboard—similar to SaleSmartly's unified inbox, but focused solely on Line OA.

## Features

- **Unified Dashboard**: Single-page view of all Line conversations
- **Real-time Chat**: Supabase Realtime for instant message updates
- **Admin Auth**: Supabase Auth (email/password or magic link)
- **Line Webhook**: Receives Line events, verifies signature (HMAC-SHA256), stores messages
- **Reply via Line API**: Send text replies to users in real-time

## Project Structure

```
line-oa/
├── app/                    # Next.js App Router
│   ├── login/              # Login page
│   ├── dashboard/          # Main dashboard
│   └── ...
├── components/             # React components
│   ├── Sidebar.tsx         # User list
│   └── ChatPanel.tsx       # Chat view + input
├── lib/
│   ├── supabase.ts        # Supabase client
│   └── api.ts             # Worker API client
├── workers/
│   └── src/index.ts       # Cloudflare Worker (webhook, chats, messages, reply)
├── supabase/
│   └── migrations/        # SQL schema
├── wrangler.toml          # Worker config
└── package.json
```

## Prerequisites

- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Supabase account
- Line Official Account with Messaging API enabled

---

## 1. Database Setup (Supabase)

### Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project
2. In **SQL Editor**, run the migration:

```sql
-- Copy contents from supabase/migrations/20260313000000_initial_schema.sql
```

Or run via Supabase CLI:

```bash
supabase db push
```

### Enable Realtime

1. In Supabase Dashboard → **Database** → **Replication**
2. Ensure `messages` table is in the `supabase_realtime` publication (the migration adds it)

### Get credentials

- **Project URL**: Settings → API → Project URL
- **anon key**: Settings → API → Project API keys → anon public
- **service_role key**: Settings → API → Project API keys → service_role (keep secret!)

---

## 2. Line Official Account Setup

1. Go to [Line Developers Console](https://developers.line.biz/console/)
2. Create or select a provider → Create a **Messaging API** channel
3. Get:
   - **Channel Access Token** (long-lived)
   - **Channel Secret**

### Configure Webhook (after deploying Worker)

1. In Line Developers Console → Your channel → **Messaging API** tab
2. **Webhook URL**: `https://YOUR-WORKER-URL.workers.dev/webhook`
3. Enable **Use webhook**
4. Disable **Auto-reply messages** and **Greeting messages** if you want full control

---

## 3. Environment Variables

### Frontend (Next.js)

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_WORKER_URL=https://line-unified-inbox-worker.xxxx.workers.dev
```

### Cloudflare Worker (secrets)

```bash
cd line-oa
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

---

## 4. Local Development

### Install dependencies

```bash
npm install
```

### Run Worker locally

```bash
npm run dev:workers
```

Worker runs at `http://localhost:8787`. Create `.dev.vars` for local secrets:

```env
LINE_CHANNEL_ACCESS_TOKEN=xxx
LINE_CHANNEL_SECRET=xxx
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Run Next.js

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`. Set `NEXT_PUBLIC_WORKER_URL=http://localhost:8787` in `.env.local` for local Worker.

### Test webhook locally (ngrok)

1. Install [ngrok](https://ngrok.com/)
2. Run: `ngrok http 8787`
3. Use the HTTPS URL in Line webhook: `https://xxxx.ngrok.io/webhook`
4. Send a message to your Line OA — it should appear in the dashboard

---

## 5. Deployment

### Deploy Worker

```bash
npm run deploy:workers
```

Note the Worker URL (e.g. `https://line-unified-inbox-worker.xxxx.workers.dev`). Update Line webhook URL to `https://YOUR-WORKER-URL/webhook`.

### Deploy Frontend (Cloudflare Pages)

```bash
npm run build
```

Then either:

**Option A: Wrangler Pages**

```bash
npx wrangler pages deploy out --project-name=line-unified-inbox
```

**Option B: Connect GitHub to Cloudflare Pages**

1. Push code to GitHub
2. Cloudflare Dashboard → **Pages** → **Create project** → **Connect to Git**
3. Select repo `line-unified-inbox`
4. Build settings:
   - **Framework preset**: Next.js (Static HTML)
   - **Build command**: `npm run build`
   - **Build output directory**: `out`
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_WORKER_URL` (your Worker URL)

### CORS

The Worker allows:
- `http://localhost:3000`, `http://127.0.0.1:3000`
- Any `*.pages.dev` origin

If you use a custom domain, update the CORS `origin` function in `workers/src/index.ts`.

---

## 6. Create Admin User

1. In Supabase Dashboard → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter email and password (or use magic link)
4. Log in at your deployed app with these credentials

---

## API Reference (Worker)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Line webhook (signature verified) |
| `/chats` | GET | List users + last message (requires `Authorization: Bearer <supabase_jwt>`) |
| `/messages/:userId` | GET | Chat history for user (requires auth) |
| `/reply` | POST | Send reply via Line (body: `{ line_user_id, content }`, requires auth) |

---

## Security

- **Line webhook**: X-Line-Signature verified with HMAC-SHA256
- **API**: All `/chats`, `/messages`, `/reply` require valid Supabase JWT
- **Database**: RLS allows only `authenticated` and `service_role`
- **Secrets**: Never commit `.env` or `.dev.vars`

---

---

## Commit and Push to GitHub

To push this project to a new GitHub repo called `line-unified-inbox`:

```bash
# 1. Initialize git (if not already)
git init

# 2. Add all files
git add .

# 3. Commit
git commit -m "Initial commit: LineUnifiedInbox MVP"

# 4. Create repo on GitHub: https://github.com/new
#    - Name: line-unified-inbox
#    - Don't initialize with README (you already have one)

# 5. Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/line-unified-inbox.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## License

MIT
