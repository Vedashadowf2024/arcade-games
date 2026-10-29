# Arcade Rooms

An online, two-player game room with Rock–Paper–Scissors (Classic or Lizard–Spock) and Tic-Tac-Toe. The interface is a browser window; a small Python standard-library server opens it locally, and Supabase Realtime carries game events between players.

## Setup

1. Create a Supabase project and make sure Realtime is enabled.
2. In the Supabase project settings, copy the Project URL and the public **publishable** key (older projects may call this the `anon` key). Never use a `service_role` key or a secret key in this app.
3. Enable anonymous sign-ins in Supabase Authentication settings. The app uses an anonymous Supabase user to keep each player's history private.
4. Open the Supabase SQL Editor and run the contents of [`supabase_schema.sql`](supabase_schema.sql) to create the history table and its row-level security policies.
5. Start the local app with `python hello.py` (or `py hello.py` on Windows). This requires Python 3.8 or newer. Keep the terminal open while playing. The app opens at `http://127.0.0.1:8765`; keep using this exact address so the browser can retain its anonymous player session.
6. In the browser window, enter the same Supabase URL and public key on both computers.
7. One player creates a room and shares the six-character code. The other joins with that code. The host chooses a game and starts.

Each player runs the app on their own computer. The Supabase project is the shared online Realtime service; neither player needs to open a port on their router. Completed matches are saved to `game_history` for both players and appear in **History**. The browser saves the project URL, public key, and anonymous auth session so history is available again in the same browser. Clearing browser storage or using another browser creates a different anonymous user, so the old history cannot be connected to that new user without adding a sign-in method. Matches played before the history table and this feature are set up are not available to backfill.

## Key and room notes

The Supabase publishable/anon key is designed to be used by browser clients. The app stores it in local browser storage for convenience; it is public and does not grant database access beyond the row-level security policies. Do not paste a secret or service-role key. Room codes are for convenience, not authentication: anyone with a code can join that room while it is active. Use this for casual play, not private or competitive games.

The game uses public Supabase Realtime Broadcast channels and Presence. If your project restricts public Realtime access, enable public channels in its Realtime settings. A room exists only while players are connected.

## Publish with GitHub Pages (HTTPS)

The app includes a GitHub Actions workflow at `.github/workflows/pages.yml`. It publishes only `index.html`, `app.js`, and `styles.css`.

1. Create a GitHub repository for the app. On GitHub Free, make it public to use GitHub Pages.
2. Upload the project files to the repository, including `.github/workflows/pages.yml`. Do not upload `debug.log`.
3. In the repository, open **Settings → Pages** and choose **GitHub Actions** as the build and deployment source.
4. Commit the files to the default branch (usually `main`). The workflow deploys the site; its HTTPS URL appears in the workflow run and the Pages settings.

GitHub Pages serves `github.io` sites over HTTPS. After publishing, share that URL with your opponent. Both players still need to enter the same Supabase project URL and publishable key on the site.
