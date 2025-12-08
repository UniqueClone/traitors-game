# 🎭 Traitors Ireland Game Night Web App

A mobile‑first web application to host an in‑person version of the _Traitors Ireland_ TV show.  
Players log in, see their role (Traitor or Faithful), view alive players with headshots, cast votes, and receive live updates for mini‑game rounds, group assignments, and locations.  
Built for one‑evening events — lightweight, subtle, and accessible.

---

## 🚀 Features

- 🔐 **Authentication**: Magic link email login (Supabase Auth).
- 🎭 **Role Assignment**: Server‑side randomization of Traitors vs Faithful.
- 📸 **Alive Dashboard**: Player list with headshots, updated in real‑time.
- 🗳️ **Voting**: Faithful banish votes + secret traitor kill votes.
- 🎲 **Mini‑Games**: Round announcements with group assignments and locations.
- ⚡ **Realtime Updates**: Supabase Realtime subscriptions keep dashboards synced.

---

## 🏗️ Tech Stack

- **Frontend**: Next.js + Tailwind CSS
- **Backend/API**: Next.js API routes
- **Database**: Supabase Postgres
- **Auth**: Supabase magic link
- **Realtime**: Supabase Realtime
- **Deployment**: Vercel

---

## 📂 Project Structure

- /pages
- /api
  - assignRoles.ts
  - assignGroups.ts
  - vote.ts
  - triggerRound.ts
  - state.ts
- /components
  - Dashboard.tsx
  - HostPanel.tsx
- /hooks
  - usePlayers.ts
  - useRounds.ts
- /lib
  - supabaseClient.ts

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
