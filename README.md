# LineUnifiedInbox

A production-ready MVP web app that aggregates all incoming chats from **multiple Line Official Accounts (Line OA)** into a single-window dashboard—similar to SaleSmartly's unified inbox, but focused solely on Line OA.

## Features

- **Multi-channel**: Add and manage multiple Line OA accounts via Settings
- **Role-based access**: super_admin (manage channels/users), admin (manage chats), viewer (read-only)
- **Unified Dashboard**: Single-page view with channel selector
- **Real-time Chat**: Supabase Realtime for instant message updates
- **Line Webhook**: Routes by `destination` (bot_user_id), credentials stored in DB
- **Reply via Line API**: Send text replies (admin+ only)

## Project Structure

```
line-oa/
├── app/
│   ├── login/              # Login page
│   ├── dashboard/          # Main dashboard (channel selector + chats)
│   └── settings/           # Channel management (super_admin only)
├── components/
│   ├── Sidebar.tsx         # Channel dropdown + user list
│   ├── ChatPanel.tsx       # Chat view + input
│   └── ChannelForm.tsx      # Add/edit channel form
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── api.ts              # Worker API client
│   ├── auth.ts             # Role check helpers
│   └── roleCheck.ts        # Re-export
├── workers/src/index.ts    # Cloudflare Worker (multi-channel webhook, reply)
├── supabase/migrations/    # SQL schema (00000 initial, 00001 channels + roles)
└── wrangler.toml
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
2. In **SQL Editor**, run migrations in order:

```sql
-- 1. Initial schema
-- Copy from supabase/migrations/20260313000000_initial_schema.sql

-- 2. Multi-channel + roles
-- Copy from supabase/migrations/20260313000001_add_channels.sql
```

Or via Supabase CLI:

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
   - **Bot User ID** (Messaging API tab, under "Bot basic ID" or from webhook `destination`)

### Add Channel via Settings (after first login)

1. Log in as **super_admin**
2. Go to **Settings** → **Add Channel**
3. Fill: Name, Bot User ID, Access Token, Secret
4. Configure webhook in Line Console: `https://YOUR-WORKER-URL/webhook`

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

Credentials are stored in DB (`channels` table). Worker only needs Supabase:

```bash
cd line-oa
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### R2 Setup for Images

To store user-sent images from Line OA:

1. **Create R2 bucket** in Cloudflare Dashboard → R2 → Create bucket → name it `line-oa-images` (or match `bucket_name` in `wrangler.toml`).

2. **Enable public access** on the bucket:
   - R2 → Your bucket → Settings → Public access → Allow Access
   - Copy the public URL (e.g. `https://pub-xxxxx.r2.dev`)

3. **Bind bucket to Worker** – either:
   - **Via wrangler.toml** (already configured): `[[r2_buckets]]` with `binding = "IMAGES_BUCKET"` and `bucket_name = "line-oa-images"`
   - **Via Dashboard**: Workers & Pages → Your Worker → Settings → Variables → R2 bucket bindings → Add binding `IMAGES_BUCKET`

4. **Set public base URL**:
   ```bash
   wrangler secret put R2_PUBLIC_BASE_URL
   ```
   Enter the public URL from step 2 (e.g. `https://pub-xxxxx.r2.dev`).

5. Run `supabase db push` to apply the image columns migration, then redeploy the Worker.

For local dev, add `R2_PUBLIC_BASE_URL` to `.dev.vars` so image uploads work when testing with ngrok.

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

Worker runs at `http://localhost:8787`. Create `.dev.vars`:

```env
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

### วิธีที่ 1: Deploy ผ่าน Dashboard (ไม่ใช้ Wrangler)

ดูคู่มือ **[DEPLOY_DASHBOARD.md](./DEPLOY_DASHBOARD.md)** สำหรับขั้นตอนแบบไม่ใช้ wrangler CLI

### วิธีที่ 2: Deploy ด้วย Wrangler

**Worker:** `npm run deploy:workers`

**Frontend (Cloudflare Pages):**

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

## 6. Create First Admin User & Set Role

### Option A: Manual (first super_admin)

1. In Supabase Dashboard → **Authentication** → **Users**
2. Click **Add user** → **Create new user** (email + password)
3. Copy the user's **UUID** (from the users table)
4. In **SQL Editor**, run:

```sql
INSERT INTO user_roles (user_id, role) VALUES ('YOUR_USER_UUID', 'super_admin');
```

5. Log in at your deployed app
6. Go to **Settings** → **Add Channel** to add your first Line OA (Bot User ID from Line Console)

### Option B: User Management UI (after first super_admin)

Once logged in as **super_admin**, go to **Users** in the sidebar to:
- Add new users (email, password, role)
- Edit user roles
- Delete users

---

## API Reference (Worker)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Line webhook (routes by `destination` = bot_user_id, credentials from DB) |
| `/channels` | GET | List channels (auth) |
| `/chats?channel_id=xxx` | GET | List users + last message (auth) |
| `/messages/:userId?channel_id=xxx` | GET | Chat history (auth) |
| `/reply` | POST | Send reply (body: `{ channel_id, line_user_id, content }`, auth, admin+) |

---

## Security

- **Line webhook**: X-Line-Signature verified with HMAC-SHA256 (secret from DB per channel)
- **API**: All endpoints require valid Supabase JWT; `/reply` requires admin/super_admin role
- **Database**: RLS by role (channels: super_admin write; messages: admin/viewer read, admin write)
- **Credentials**: Stored in `channels` table (Supabase encryption)

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
