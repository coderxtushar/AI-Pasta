# AI Pasta

Compare answers from several AI models side by side. Type one prompt, pick models
(OpenAI, Anthropic, Gemini, DeepSeek, Groq, Qwen), and watch each answer stream in
with its latency, token count and cost. Signed-in users get a saved history, can
share any comparison with a public link, and can store their API keys encrypted in
their account.

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

7. **Optional: store keys in accounts.** Set `KEYS_ENCRYPTION_KEY` to 32 random bytes:

   ```bash
   openssl rand -base64 32
   ```

   Signed-in users then save provider keys to their account instead of the browser
   (see [API key storage](#api-key-storage)).

When running `npm start` or self-hosting outside Vercel, also set
`AUTH_TRUST_HOST=true` (or `AUTH_URL` to your public URL).

## API key storage

AI Pasta never pays for model calls. Every request uses the user's own provider key.

| Who | Where keys live | How they reach the provider |
| --- | --- | --- |
| Signed out, or `KEYS_ENCRYPTION_KEY` unset | Browser localStorage | Sent with each request for that provider only |
| Signed in, `KEYS_ENCRYPTION_KEY` set | `api_key` table, encrypted | Server decrypts the key for the request; the browser never receives it |

How account keys are protected:

- **AES-256-GCM** with a random IV per key. Tampered ciphertext fails to decrypt
  instead of producing garbage.
- **Bound to the owner.** The user ID and provider are authenticated data, so a row
  copied to another account or provider can't be decrypted.
- **Write-only from the browser.** The API accepts a key and returns only its last
  4 characters. Keys are never logged or sent back.
- When a signed-in user still has keys in their browser, the app offers to move them
  into the account and then deletes the browser copy.

**Back up `KEYS_ENCRYPTION_KEY`.** If it's lost or changed, saved keys can't be
decrypted. Users see "save it again" and must re-enter their keys. Each row records
which key encrypted it (`keyId`), so a rotation script can re-encrypt old rows later.

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
    api/keys/                Save, list (hints only) and remove account keys
    history/                 Saved comparisons: search, re-run, delete
    c/[id]/                  One comparison; public when shared
    library/                 Model registry, pricing, stream format (client-safe)
  server/
    llm.ts                   Provider setup for the AI SDK
    comparisons.ts           History queries
    apiKeys.ts               Saved key storage (encrypt on write, decrypt per request)
    crypto.ts                AES-256-GCM helpers
    db/                      Drizzle schema and client
  auth.ts                    Auth.js config
drizzle/                     SQL migrations
```

Models and prices live in `src/app/library/models.ts`. Adding a model is one entry.
