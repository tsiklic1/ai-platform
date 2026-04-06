# AI Platform Backend

Hono + Bun + Supabase

## Setup

```bash
# Install dependencies
bun install

# Copy env and fill in your Supabase keys
cp .env.example .env

# Run dev server (hot reload)
bun run dev

# Run production
bun run start
```

Server runs on `http://localhost:3000`

## Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API
3. Copy URL, anon key, and service role key into `.env`

### Local Supabase (optional)

```bash
npx supabase start   # requires Docker
npx supabase stop
```
