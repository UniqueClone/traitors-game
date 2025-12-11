# Supabase Setup & Usage

This document explains how this project uses Supabase and how to configure a fresh Supabase project so the app can run end‑to‑end.

## 1. Env Vars & Project Keys

Create a Supabase project, then add these environment variables to `.env.local` (and to your hosting provider):

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=<your-supabase-anon-or-public-key>
```

These are consumed only through the helpers in `utils/supabase/`:
- Browser client: `utils/supabase/client.ts`
- Server client: `utils/supabase/server.ts`
- Middleware client: `utils/supabase/middleware.ts`

Do **not** read env vars directly in components; always use the helpers.

## 2. Auth Model

We use Supabase Auth with email + password (no magic links in this codebase yet):

- Login / signup: `app/login/page.tsx`
  - `supabase.auth.signInWithPassword({ email, password })`
  - `supabase.auth.signUp({ email, password })`
  - On successful signup, user is redirected to `/login/new-player`.
- Session checks:
  - Client pages use `supabase.auth.getSession()` / `supabase.auth.getUser()`.
  - Middleware uses `supabase.auth.getUser()` via the server client to guard routes.

User profile data is stored both in Auth user metadata and in a `players` table (see below).

## 3. Database Tables

Create these tables in your Supabase Postgres database. Column names should match exactly; types are suggestions and can be adjusted as long as the names and basic semantics remain.

### 3.1 `games`

Top‑level container for a single run of the show. Players, rounds, and votes are all associated with a game so the app can be reused across multiple events.

Suggested schema:
- `id` (`uuid`, PK).
- `name` (`text`, not null) – label for the event (e.g. "New Year Game Night").
- `status` (`text`, not null) – e.g. `'active'`, `'archived'`.
- `current_round_number` (`int`, nullable) – convenience field for host dashboards.
- `created_at` (`timestamptz`, default `now()`).
 - `host` (`uuid`, nullable) – FK to `players.id` for the player acting as host for this game.

Conventions:
- At most one game should be in `status = 'active'` at a time; the app always uses that as the "current" game.
- Historical data (old rounds and votes) stays associated to past games via FKs.

Usage in code:
- `app/login/new-player/page.tsx` looks up the single active game and joins the new player to it.
- `app/player-wall/page.tsx` and `app/voting/page.tsx` both scope their queries to the active game.

### 3.2 `players`

Used for the player wall, headshots, role information, and game membership.

Suggested schema:
- `id` (`uuid`, PK) – must match `auth.users.id`.
- `game_id` (`uuid`, not null) – FK to `games.id` (the game this player belongs to).
- `full_name` (`text`, not null).
- `headshot_url` (`text`, not null) – public URL from Storage.
- `eliminated` (`boolean`, not null, default `false`).
- `role` (`text`, nullable) – e.g. `'Traitor'` or `'Faithful'` (used by voting logic).

Usage in code:
- `app/login/new-player/page.tsx` upserts:
  - `{ id, game_id, full_name, headshot_url, eliminated: false }` where `game_id` is the active game.
- `app/player-wall/page.tsx` reads:
  - `id, full_name, headshot_url, eliminated` for all players in the active game.
- `app/player-wall/page.tsx` updates:
  - `eliminated` when toggling a player, scoped to the active game.
- `app/voting/page.tsx` reads:
  - Non‑eliminated players in the active game for the voting dropdown.
  - Current player’s `role` to distinguish traitors vs faithful.
  - Ensures the current user has a `players` row for the active game before allowing access.

### 3.3 `game_rounds`

Tracks all rounds for a given game, including the current active round and historical ones.

Minimum schema to support the current code:
- `id` (`uuid`, PK).
- `game_id` (`uuid`, not null) – FK to `games.id`.
- `round` (`int`, nullable) – round number.
- `type` (`text`, nullable) – one of:
  - `'round_table'`
  - `'banishment_vote'`
  - `'banishment_result'`
  - `'killing_vote'`
  - `'breakfast'`
  - `'minigame'`
- `status` (`text`, not null) – e.g. `'active'`, `'pending'`, `'closed'`.

Usage in code:
- `app/voting/page.tsx` queries:
  - `.from('game_rounds').select('id, round, type, status').eq('game_id', <activeGameId>).eq('status', 'active').in('type', ['banishment_vote', 'killing_vote']).maybeSingle()`
  - If there is no row with `status = 'active'` and `type in ('banishment_vote','killing_vote')` for the active game, the voting page shows “No voting round is currently active…”.

### 3.4 `votes`

Stores player responses per round. The schema is intentionally generic so you can interpret votes differently for standard vs kill rounds.

Minimum schema:
- `id` (`uuid`, PK, default `gen_random_uuid()`).
- `voter_id` (`uuid`, not null) – FK to `players.id` / `auth.users.id`.
- `target_id` (`uuid`, not null) – the selected player (FK to `players.id`).
- `round_id` (`uuid`, not null) – FK to `game_rounds.id`.
- `type` (`text`, not null) – `'standard'` or `'kill'` (current code uses exactly these strings).
- Timestamps (`created_at` etc.) are recommended but optional.

Usage in code (`app/voting/page.tsx`):
- Before inserting, we check if the user already voted this round:
  - `select('id').eq('voter_id', user.id).eq('round_id', activeRound.id).maybeSingle()`.
  - If a record exists, we show “Your response for this round has already been recorded.” and skip insertion.
- When saving a response, we insert:
  - `{ voter_id, target_id, round_id, type }`.
  - `type = 'kill'` only if `activeRound.type === 'killing_vote'` **and** the player’s `role` is `'Traitor'`; otherwise `type = 'standard'`.

To harden this in the database, also add a unique index to enforce at most one vote per user per round:

```sql
create unique index if not exists votes_voter_round_unique
    on public.votes (voter_id, round_id);
```

## 4. Storage Buckets

We use Supabase Storage for player headshots.

### Bucket: `user-headshots`

Create a bucket named `user-headshots`.

- Upload path pattern:
  - `user-headshots/<user.id>-<timestamp>.<ext>`
  - Implemented in `app/login/new-player/page.tsx` as:
    - `const filePath = "user-headshots/${user.id}-${Date.now()}.${ext}";`
- Upload flow:
  - `supabase.storage.from('user-headshots').upload(filePath, headshotFile)`.
  - Then `getPublicUrl(uploadData.path)` to store the public URL in DB and user metadata.

Recommended policies:
- Public read access to the `user-headshots` bucket so `next/image` can display images without signed URLs.
- Only authenticated users can upload/update; enforce via RLS and Storage policies as needed.

## 5. Supabase Client Helpers

All Supabase access goes through small helpers in `utils/supabase/`.

### 5.1 Browser client – `utils/supabase/client.ts`

Used in client components (`'use client'`):

- Implementation:
  - `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)`.
- Usage examples:
  - `app/login/page.tsx` – auth login/sign‑up.
  - `app/login/new-player/page.tsx` – session checks, Storage uploads, DB upserts.
  - `app/player-wall/page.tsx` – fetches and updates players.
  - `app/voting/page.tsx` – auth checks, loads rounds & players, inserts votes.

### 5.2 Server client – `utils/supabase/server.ts`

Intended for server components, route handlers, and server‑side utilities.

- Implementation:
  - Uses `createServerClient` from `@supabase/ssr` with `next/headers` cookies.
- Pattern:
  - `const cookieStore = cookies();`
  - `const supabase = createClient(cookieStore);`

(Currently not heavily used yet, but should be used for any future server‑side Supabase queries.)

### 5.3 Middleware client – `utils/supabase/middleware.ts`

Special helper for Next.js middleware.

- Implementation:
  - `createClient(request)` returns `{ supabase, response }`.
  - Uses `createServerClient` and wires cookies through `NextResponse` so auth sessions persist.
- Usage:
  - See `middleware.ts` at repo root.

## 6. Route Protection (Middleware)

Global middleware is defined in `middleware.ts` to keep certain routes behind auth and to redirect logged‑in users away from the login page.

Logic:
- For every request matching:
  - `/login/:path*`, `/player-wall/:path*`, `/voting/:path*`.
- Steps:
  1. Call `createClient(request)` from `utils/supabase/middleware.ts`.
  2. `const { data: { user } } = await supabase.auth.getUser();`
  3. If **no** user and path is protected (`/login/new-player`, `/player-wall`, `/voting`):
     - Redirect to `/login`.
  4. If a user **is** logged in and the path is `/login`:
     - Redirect to `/player-wall`.
  5. Otherwise return the `response` from the helper.

This ensures voting, player wall, and profile completion are only available to authenticated players.

## 7. Feature‑Level Supabase Usage

### 7.1 Login (`/login`)

File: `app/login/page.tsx`
- Uses browser client.
- Handles email/password login and sign‑up.
- On signup success, redirects to `/login/new-player` to collect profile details and headshot.

### 7.2 New Player (`/login/new-player`)

File: `app/login/new-player/page.tsx`
- Requires an active session (checks `supabase.auth.getSession` and redirects to `/login` if missing).
- Uploads headshot to `user-headshots` bucket.
- Saves `full_name` and `headshot_url` to:
  - Auth user metadata (`supabase.auth.updateUser`).
  - `players` table via `upsert`.
- Redirects to `/player-wall` upon success.

### 7.3 Player Wall (`/player-wall`)

File: `app/player-wall/page.tsx`
- Loads all players (currently from `players` table; ensure the table name matches your schema) ordered by `full_name`.
- Shows headshots using `next/image`.
- Clicking a card toggles `eliminated` with an optimistic update and rollback on error.

### 7.4 Voting (`/voting`)

File: `app/voting/page.tsx`
- Requires auth (also protected by middleware).
- On load:
  - Ensures the user is logged in (`auth.getUser`).
  - Fetches the single active round from `game_rounds` (`status = 'active'`).
  - If no active round, shows a neutral “no round active” message.
  - Loads all non‑eliminated players from `players` for the dropdown.
- On submit:
  - Re‑checks the current user.
  - Checks for an existing vote for this user + round in `votes`; if found, shows a message and exits.
  - Loads the current player’s `role` from `players`.
  - Only rounds with `type` of `'banishment_vote'` or `'killing_vote'` will ever reach this form.
  - If `activeRound.type === 'killing_vote'` and `role === 'Traitor'`, saves vote with `type = 'kill'`; otherwise `type = 'standard'`.
  - UI and wording stay neutral so traitors and faithful have indistinguishable interfaces.

## 8. Row Level Security (RLS)

Enable RLS on each table and add these baseline policies so the app works correctly with the anon/publishable key. You can add stricter host/service-role policies later.

> All examples assume `auth.uid()` is the authenticated user id and that you run them in the SQL editor for your Supabase project.

### 8.1 `games` policies

Players need to read games; hosts additionally need to create and update them. The host for a given game is tracked by a nullable foreign key `host` pointing at `players.id`.

```sql
alter table public.games enable row level security;

-- All authenticated players can read games they are in, plus the active game
create policy "Players can read active or joined games" on public.games
for select
to authenticated
using (
  status = 'active'
  or id in (
    select game_id from public.players where id = auth.uid()
  )
);

-- Players can create games where they set themselves as host
create policy "Hosts can create games" on public.games
for insert
to authenticated
with check (
  host = auth.uid()
);

-- Only the host of a game can update it
create policy "Hosts can update their games" on public.games
for update
to authenticated
using (
  host = auth.uid()
)
with check (
  host = auth.uid()
);
```

### 8.2 `players` policies

Players must be able to:
- See all players in their current game (for the wall and voting dropdown).
- Insert/update **their own** player row for that game.

```sql
alter table public.players enable row level security;

-- Read all players in the same game as the current user
create policy "Players can read players in their games" on public.players
for select
to authenticated
using (
  game_id in (
    select game_id from public.players where id = auth.uid()
  )
);

-- Create their own player row
create policy "Players can insert their own player" on public.players
for insert
to authenticated
with check (
  id = auth.uid()
);

-- Update their own player row (e.g. future profile changes)
create policy "Players can update their own player" on public.players
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());
```

### 8.3 `game_rounds` policies

Players only need to read rounds for games they are in; inserts/updates should be done by a host or service-role key. The host for a game is stored on `games.host`.

```sql
alter table public.game_rounds enable row level security;

create policy "Players can read rounds in their games" on public.game_rounds
for select
to authenticated
using (
  game_id in (
    select game_id from public.players where id = auth.uid()
  )
);

-- Hosts can create rounds for games they host
create policy "Hosts can insert rounds for their games" on public.game_rounds
for insert
to authenticated
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_rounds.game_id
      and g.host = auth.uid()
  )
);

-- Hosts can update rounds for games they host
create policy "Hosts can update rounds for their games" on public.game_rounds
for update
to authenticated
using (
  exists (
    select 1
    from public.games g
    where g.id = game_rounds.game_id
      and g.host = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.games g
    where g.id = game_rounds.game_id
      and g.host = auth.uid()
  )
);
```

### 8.4 `votes` policies

Players should only be able to create and read **their own** votes.

```sql
alter table public.votes enable row level security;

-- Read own votes (used for the "already voted" check)
create policy "Players can read their own votes" on public.votes
for select
to authenticated
using (
  voter_id = auth.uid()
);

-- Insert their own votes
create policy "Players can insert their own votes" on public.votes
for insert
to authenticated
with check (
  voter_id = auth.uid()
);
```

### 8.5 Storage policies for `user-headshots`

In the SQL editor, add Storage policies on `storage.objects` so the app can read/write headshots.

```sql
-- Example: allow public read access to objects in the user-headshots bucket
create policy "Public read access to user headshots" on storage.objects
for select
to public
using (bucket_id = 'user-headshots');

-- Example: only authenticated users can upload/update to user-headshots
create policy "Authenticated users can manage their headshots" on storage.objects
for insert, update
to authenticated
with check (bucket_id = 'user-headshots');
```

For stricter control, you can tie uploads to `auth.uid()` by encoding the user id into the path and checking `storage.foldername(name)` or similar, but the above is enough for the current code (which only ever writes into `user-headshots/<user.id>-...`).

### 8.6 Host players

The host for a game is tracked by `games.host`, which points to a row in `players` (and therefore to an auth user id). The `/host/games` page assumes:

- When you create a game from the UI, `host` is set to your own `players.id` (which equals `auth.uid()`).
- Only that player (the host) can update the game row, as enforced by the `Hosts can create games` and `Hosts can update their games` policies above.

You can also manually change the host of a game by updating `games.host` in SQL to another player's `id`.

## 9. What You Still Need To Configure

With this code in place, setting up a new Supabase project requires:

1. Add env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`).
2. Create tables: `players`, `game_rounds`, `votes` with at least the columns described above.
3. Create Storage bucket `user-headshots` and set public read access.
4. Optionally configure RLS policies on tables/bucket so that:
   - Only authenticated users can insert/update their own player record and votes.
   - Hosts (or a service role) can manage rounds and inspect votes.

Once these are in place, the login → new-player → player wall → voting flows should work against your new Supabase project.
