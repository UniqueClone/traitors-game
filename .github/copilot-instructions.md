# GitHub Copilot Instructions for this Repo

## Snapshot
- Next.js 16 app-router app (app/) on React 19.
- Tailwind CSS 4 with custom theme variables in app/globals.css (bg-(--tg-bg), text-(--tg-gold), etc.).
- Supabase for auth, Postgres, and Storage using helpers in utils/supabase/.
- Core entities: games, players, game_rounds, votes (see SUPABASE.md for schema/RLS truth).

## Architecture & Flows
- Global layout/nav: app/layout.tsx sets the local font via next/font/local and renders a header with a hamburger menu linking to /, /login, /player-wall, /host/games.
- Auth + middleware: middleware.ts uses createClient from utils/supabase/middleware to protect /login/new-player, /player-wall, /voting, /host/*; logged-in users are redirected away from /login.
- Login/signup: app/login/page.tsx is a client component using createClient; it calls supabase.auth.signInWithPassword / signUp, then routes new signups to /login/new-player.
- New player profile: app/login/new-player/page.tsx requires an active session, uploads a headshot to the user-headshots bucket, updates auth metadata, and upserts into players with { id, game_id (active game), full_name, headshot_url, eliminated: false } before sending users to /player-wall.
- Active game + host: a single game with status='active' is treated as the current event; app/host/games/page.tsx lets the host (games.host = auth user id) create games and set exactly one active at a time; app/host/games/[id]/page.tsx manages that game’s rounds.
- Player wall: app/player-wall/page.tsx looks up the active game, verifies the user has a players row for that game, then lists all players in that game and toggles eliminated with an optimistic Supabase update + rollback on error.
- Voting: app/voting/page.tsx ensures logged-in users belong to the active game, loads the single active round from game_rounds, shows non-eliminated players for that game, prevents duplicate votes per round, and derives vote.type ('standard' vs 'kill') from round.type + players.role while keeping the UI identical for all roles.

## Supabase Usage
- Env vars: always go through helpers; use NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY (anon/publishable key) in utils/supabase/client.ts, server.ts, middleware.ts.
- Clients: use createClient (browser) in client components ('use client'); use utils/supabase/server for future server components/route handlers; use utils/supabase/middleware only from middleware.ts.
- Storage: player images are in the user-headshots bucket at user-headshots/<user.id>-<timestamp>.<ext>; reuse this pattern when adding uploads.
- Data access: most queries are game-scoped; when touching players, game_rounds, or votes, always include the relevant game_id / round_id filters and respect the “active game” convention from existing pages.

## Conventions for Agents
- Prefer small, focused client pages under app/<route>/page.tsx; do not introduce legacy pages/ or pages/api.
- Follow existing card-and-background styling from app/player-wall/page.tsx and app/host/games/page.tsx, using CSS variables instead of hard-coded colors.
- When adding new protected routes, update middleware.ts and reuse the auth + membership checks shown in app/player-wall/page.tsx and app/voting/page.tsx.
- For host-only features, key permissions off games.host and mirror the patterns in app/host/games/page.tsx and app/host/games/[id]/page.tsx.
- Use SUPABASE.md and README.md as the source of truth for schema and flows; keep this file aligned whenever you change login, new-player, player wall, voting, or host tools.
