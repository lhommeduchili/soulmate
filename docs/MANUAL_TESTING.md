# Manual Testing Guide - Soulmate Phase 3

This guide allows you to verify the full "Search & Queue" workflow of the application.

## Prerequisites
1.  **Spotify App Creds:** Ensure you have `VITE_SPOTIFY_CLIENT_ID` in your `.env`.
2.  **Spotify Account:** You need a valid Spotify account to log in.

## Step-by-Step Verification

### 1. Launch the Application
Run the development server. This starts the Main process (Electron) and Renderer (React).
```bash
npm run dev
```
> **Verify:** The app window opens with the "SOULMATE v2.0" header and the "SYSTEM_DISCONNECTED" status.

### 2. Configure Priority (Pre-Login)
On the login screen, you will see a **Quality Priority** selector.
1.  **Action:** Use the arrows (▲/▼) to reorder the formats (e.g., move `mp3` to the top).
2.  **Verify:** The order updates instantly. This preference is saved in the background.

### 3. Authenticate
1.  **Action:** Click the "LOGIN WITH SPOTIFY" button.
2.  **Action:** Your browser will open. Accept the permissions.
3.  **Verify:**
    - Browser redirects to `soulmate://callback...`.
    - App comes to foreground.
    - View switches to the **Playlist Selector** grid.
    - Header status changes to "SYSTEM_ONLINE".

### 4. Select a Playlist
1.  **Action:** Click on any playlist card (e.g., "Discover Weekly").
2.  **Verify:**
    - View switches to the **Playlist Review** table.
    - Tracks are loaded (you might see a brief "Loading..." or "Decrypting..." state).
    - All tracks are selected by default.

### 5. Review & Queue
1.  **Action:** Uncheck one track.
2.  **Action:** Click "DOWNLOAD SELECTED".
3.  **Verify:**
    - An alert confirms the number of queued tracks.
    - **Check Terminal Logs:** Look for `[QueueService] Searching for: ...`.
    - Note: Since we are using a dummy `slskd` binary in dev, the actual search will log "Search initiated" but might not return results. This confirms the *request logic* is working.

## Troubleshooting
- **Login doesn't redirect?** Ensure you registered `soulmate://callback` in your Spotify Dashboard.
- **No Playlists?** Check the terminal for `[SpotifyService] Error`. Ensure your account has public playlists.

### 6. Queue Management (New Features)
1.  **Marquee Text:**
    - **Action:** Queue a song with a very long title.
    - **Verify:** Hovering over the text causing it to scroll horizontally (Marquee effect).
2.  **Clear Queue:**
    - **Action:** Hover over the "DOWNLOAD QUEUE" header.
    - **Verify:** A "CLEAR" button appears on the right.
    - **Action:** Click "CLEAR".
    - **Verify:** The queue empties immediately (no confirmation popup).

## Phase 4: Packaging Verification
1.  **Build the App:**
    ```bash
    npm run binaries:download
    npm run build:mac
    ```
2.  **Inspect Extensions:**
    - Navigate to `dist/mac-arm64/Soulmate.app/Contents/Resources/`.
    - **Verify:** `slskd` binary is present (~117MB).
3.  **Run the Artifact:**
    - Open `dist/mac-arm64/Soulmate.app`.
    - **Verify:** App opens, connects (SYSTEM_ONLINE), and performs similarly to dev mode.
