# AI Pasta

Compare answers from several AI models side by side. Type one prompt, pick models
(OpenAI, Anthropic, Gemini, DeepSeek, Groq, Qwen), and watch each answer stream in
with its latency, token count and cost. Signed-in users get a saved history and can
share any comparison with a public link.

Built with Next.js 15, the Vercel AI SDK, Auth.js (Google sign-in), Drizzle ORM and Postgres.

## Quick start (no account features)

```bash
npm install
npm run dev
```

Open http://localhost:3000, paste your provider API keys in the **API Keys** panel,
and compare. Keys stay in your browser's localStorage and are sent only with the
request for that provider's model.

## Enabling sign-in, history and sharing

Account features turn on when `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID` and
`AUTH_GOOGLE_SECRET` are all set. Without them the app runs in anonymous mode.

1. **Copy the env file**

   ```bash
   cp .env.example .env.local
   ```

2. **Start Postgres.** Use any Postgres 14+ (Neon and Supabase both work; use their
   pooled connection string). For local development:

   ```bash
   docker run -d --name aipasta-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=aipasta \
     -p 55432:5432 postgres:16-alpine
   ```

   The default `DATABASE_URL` in `.env.example` matches this container.

3. **Create the tables**

   ```bash
   npm run db:migrate
   ```

4. **Generate the auth secret**

   ```bash
   npx auth secret   # writes AUTH_SECRET to .env.local
   ```

5. **Create a Google OAuth client** in Google Cloud Console → APIs & Services →
   Credentials → *Create OAuth client ID* (type: Web application). Add the redirect URI
   `http://localhost:3000/api/auth/callback/google` (plus your production URL's
   equivalent), then put the client ID and secret in `AUTH_GOOGLE_ID` and
   `AUTH_GOOGLE_SECRET`.

6. `npm run dev`. A **Sign in with Google** button appears in the header.

When running `npm start` or self-hosting outside Vercel, also set
`AUTH_TRUST_HOST=true` (or `AUTH_URL` to your public URL).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` | ESLint |
| `npm run db:generate` | Create a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:studio` | Browse the database in Drizzle Studio |

## Project layout

```
src/
  app/
    page.tsx                 Home (server): session + "re-run" prefill
    components/Compare.tsx   Compare UI: streams one request per model
    api/generate/            Streams one model's answer (NDJSON), saves it if signed in
    api/comparisons/         Creates a history entry
    history/                 Saved comparisons: search, re-run, delete
    c/[id]/                  One comparison; public when shared
    library/                 Model registry, pricing, stream format (client-safe)
  server/
    llm.ts                   Provider setup for the AI SDK
    comparisons.ts           Database queries
    db/                      Drizzle schema and client
  auth.ts                    Auth.js config
drizzle/                     SQL migrations
```

Models and prices live in `src/app/library/models.ts`. Adding a model is one entry.
