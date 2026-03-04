# manual testing guide - soulmate phase 3

this guide allows you to verify the full "search & queue" workflow of the application.

## prerequisites
1.  **spotify app creds:** ensure you have `vite_spotify_client_id` in your `.env`.
2.  **spotify account:** you need a valid spotify account to log in.

## step-by-step verification

### 1. launch the application
run the development server. this starts the main process (electron) and renderer (react).
```bash
npm run dev
```
> **verify:** the app window opens with the "soulmate v2.0" header and the "system_disconnected" status.

### 2. configure priority (pre-login)
on the login screen, you will see a **quality priority** selector.
1.  **action:** use the arrows (▲/▼) to reorder the formats (e.g., move `mp3` to the top).
2.  **verify:** the order updates instantly. this preference is saved in the background.

### 3. authenticate
1.  **action:** click the "login with spotify" button.
2.  **action:** your browser will open. accept the permissions.
3.  **verify:**
    - browser redirects to `soulmate://callback...`.
    - app comes to foreground.
    - view switches to the **playlist selector** grid.
    - header status changes to "system_online".

### 4. select a playlist
1.  **action:** click on any playlist card (e.g., "discover weekly").
2.  **verify:**
    - view switches to the **playlist review** table.
    - tracks are loaded (you might see a brief "loading..." or "decrypting..." state).
    - all tracks are selected by default.

### 5. review & queue
1.  **action:** uncheck one track.
2.  **action:** click "download selected".
3.  **verify:**
    - an alert confirms the number of queued tracks.
    - **check terminal logs:** look for `[queueservice] searching for: ...`.
    - note: since we are using a dummy `slskd` binary in dev, the actual search will log "search initiated" but might not return results. this confirms the *request logic* is working.

## troubleshooting
- **login doesn't redirect?** ensure you registered `soulmate://callback` in your spotify dashboard.
- **no playlists?** check the terminal for `[spotifyservice] error`. ensure your account has public playlists.

### 6. queue management (new features)
1.  **marquee text:**
    - **action:** queue a song with a very long title.
    - **verify:** hovering over the text causing it to scroll horizontally (marquee effect).
2.  **clear queue:**
    - **action:** hover over the "download queue" header.
    - **verify:** a "clear" button appears on the right.
    - **action:** click "clear".
    - **verify:** the queue empties immediately (no confirmation popup).

## phase 4: packaging verification
1.  **build the app:**
    ```bash
    npm run binaries:download
    npm run build:mac
    ```
2.  **inspect extensions:**
    - navigate to `dist/mac-arm64/soulmate.app/contents/resources/`.
    - **verify:** `slskd` binary is present (~117mb).
3.  **run the artifact:**
    - open `dist/mac-arm64/soulmate.app`.
    - **verify:** app opens, connects (system_online), and performs similarly to dev mode.
