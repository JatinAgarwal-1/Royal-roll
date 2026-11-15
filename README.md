# Roll Royale — 4-player online Ludo

A static HTML/CSS/JavaScript Ludo game. GitHub Pages hosts the frontend; Supabase stores room state and broadcasts database changes to connected players.

## Included
- Four seats: Red, Green, Yellow and Blue
- Optional 2-vs-2 team mode (enabled by default)
- Default partners sit in opposite corners: Red + Yellow (Team Sun) vs Green + Blue (Team Moon)
- Joiners can request a random team shuffle when the room fills
- Room host can reshuffle teams once all four players have joined
- Team victory requires all eight tokens belonging to that team to reach home
- Private six-character room codes
- Up to four friends per room
- Realtime room-state synchronization using Supabase Postgres Changes
- Dice, token exits on six, exact finish, captures, safe squares, extra roll on six
- Responsive layout for phones and desktop

## 1. Create Supabase project
1. Create a free project at https://supabase.com/dashboard.
2. Open **SQL Editor** and run the complete contents of `supabase.sql`.
3. Open **Project Settings → API** (or **Data API**) and copy the Project URL and public anon/publishable key.
4. In `app.js`, replace:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
5. Do not put a `service_role` or secret key in browser code.

## 2. Test locally
Because the app uses JavaScript modules, serve the folder over HTTP rather than opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Open http://localhost:8000. Create a room in one browser/device and join it from another using the room code. Use separate browser profiles or devices to test multiple players.

## 3. Publish on GitHub Pages
1. Create a GitHub repository, e.g. `roll-royale`.
2. Upload `index.html`, `styles.css`, `app.js`, and `supabase.sql` (README optional) to the repository root.
3. Go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait for GitHub Pages to publish. Your game URL will look like `https://YOUR-USERNAME.github.io/roll-royale/`.
6. Share that URL and the six-character room code with friends.

## Team mode
- New rooms start in 2-vs-2 team mode by default. Uncheck **Team up · 2 vs 2** to play free-for-all.
- In team mode, the default teams are Red + Yellow (Team Sun) and Green + Blue (Team Moon).
- A player joining a team room can check **Shuffle teams when room is full**. If any joiner selects it, teams are randomized once the fourth seat is filled.
- After all four players join, the room host can use **Shuffle teams** in the Players panel to randomly split the four players into two teams again.
- Turns remain in color order. Partners cannot move each other's tokens; the team wins when all eight tokens from both partners reach home.

## Important security / gameplay notes
This starter is a working multiplayer prototype, not a cheat-resistant competitive game. The SQL policy is intentionally permissive so anonymous guests can create and update rooms without an authentication flow. A room code is not a security boundary: someone with the anon key and database access can inspect or alter game state. For a public production release, add Supabase anonymous authentication, per-room membership tables, restrictive RLS policies, and server-side/Edge Function validation of moves and dice rolls.

The client currently rolls the dice locally and writes the resulting game state. This is fine for a friends-only prototype, but it is not tamper-proof. Also, the board uses a simplified standard path and common Ludo rules; regional house rules can differ.

## Troubleshooting
- **Setup required**: check the Supabase URL and public anon/publishable key in `app.js`.
- **Room not found**: make sure `supabase.sql` ran successfully and the code has six characters.
- **Players don't sync**: confirm the `ludo_rooms` table is included in the `supabase_realtime` publication and that the SQL policies were created.
- **GitHub Pages shows a blank page**: ensure the files are in the selected branch/folder and open the browser console for JavaScript errors.
