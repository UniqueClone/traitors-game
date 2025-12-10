# 🎭 Traitors Ireland Game Night Web App

A mobile‑first web application to host an in‑person version of the _Traitors Ireland_ TV show.  
Players log in, see their role (Traitor or Faithful), view alive players with headshots, cast votes, and receive live updates for mini‑game rounds, group assignments, and locations.  
Built for one‑evening events — lightweight, subtle, and accessible.

---

## 🚀 Features

- 🔐 **Authentication**: Email + password (Supabase Auth) with a new‑player profile step.
- 🕹️ **Games**: Each event is a `game` in Supabase; players, rounds, and votes are all scoped to the active game so the app can be reused.
- 🎭 **Role Assignment**: Traitors vs Faithful roles stored per‑player per‑game.
- 📸 **Player Wall**: Game‑scoped player list with headshots and elimination state.
- 🗳️ **Voting**: Per‑round voting with support for standard and traitor‑only kill rounds.

---

## 🏗️ Tech Stack

- **Frontend**: Next.js + Tailwind CSS
- **Backend/API**: Next.js API routes
- **Database**: Supabase Postgres
- **Auth**: Supabase magic link
- **Realtime**: Supabase Realtime
- **Deployment**: Vercel

---

## 📂 Project Structure (current)

- /app
  - page.tsx – landing page
  - login/page.tsx – login/signup
  - login/new-player/page.tsx – profile + headshot upload
  - player-wall/page.tsx – game‑scoped player wall
  - voting/page.tsx – per‑round voting UI
- /utils/supabase
  - client.ts – browser client via `@supabase/ssr`
  - server.ts – server client for RSC / route handlers
  - middleware.ts – client wiring for Next.js middleware

Older `/pages`/`/api` references in this README are from an earlier version and can be ignored; this app now uses the Next.js `app/` router exclusively.

---

## 🗄️ Database Schema

### Player

- `id` (uuid, PK)
- `name` (text)
- `email` (unique)
- `role` ("Traitor" | "Faithful")
- `alive` (boolean)
- `headshot_url` (text)

### Vote

- `id` (uuid, PK)
- `voter_id` (FK → Player)
- `target_id` (FK → Player)
- `round` (int)
- `type` ("banish" | "traitor-kill")

### GameRound

- `id` (uuid, PK)
- `round` (int)
- `type` (text)
- `groups` (jsonb)
- `location` (text)
- `start_time` (timestamptz)
- `triggered` (boolean)

---

## ⚙️ Setup

1. **Clone repo**

    ```bash
    git clone https://github.com/yourname/traitors-game.git
    cd traitors-game
    ```

Install dependencies

npm install

Configure environment

Create .env.local:

NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

Run locally

npm run dev

Deploy

Push to GitHub.

Deploy on Vercel.

Add Supabase keys in Vercel environment variables.

🎮 Usage Flow

Host Setup

Upload player headshots.

Assign roles via Host Panel.

Create rounds with group assignments.

Player Experience

Log in via email magic link.

See role + alive dashboard.

Receive round announcements.

Cast votes discreetly.

Host Control Panel

Buttons: Assign Roles, Assign Groups, Trigger Round, Reveal Votes.

Full visibility of state.

🧩 Example Realtime Subscription

const channel = supabase
.channel("player-changes")
.on("postgres_changes", { event: "\*", schema: "public", table: "Player" }, payload => {
console.log("Player change:", payload);
})
.subscribe();

📌 Notes

Designed for one‑evening events — ephemeral state, reset after game.

Keep traitor actions subtle (identical UI, hidden extra option).

Ensure accessibility: semantic HTML, ARIA live, dark mode.

🛠️ Future Enhancements

Push notifications for round start.

Host dashboard stats.

Animated role reveals.
