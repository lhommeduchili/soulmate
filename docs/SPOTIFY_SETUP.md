# Spotify Developer Setup Guide

To enable "Connect with Spotify" in Soulmate, you need to configure a Spotify App in the Developer Dashboard.

## 1. Create the App
1.  Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2.  Click the **"Create app"** button.
3.  Fill in the details:
    -   **App name:** `Soulmate` (or similar)
    -   **App description:** `Desktop client for DJs.`
    -   **Redirect URI:** `soulmate://callback` (Crucial!)
    -   **Which API/SDKs are you planning to use?** Select "Web API".
4.  Check the terms and click **"Save"**.

## 2. Get Credentials
1.  On your app page, go to **"Settings"**.
2.  Under **"Basic Information"**, find the **Client ID**.
3.  Copy this Client ID.

## 3. Configure User Access (Development Mode)
By default, new apps are in "Development Mode". You must explicitly add the Spotify accounts that are allowed to log in.

1.  Go to **"Settings"** -> **"User Management"**.
2.  Click **"Add user"**.
3.  Enter the **name** and **email address** associated with your Spotify account.
4.  Click **"Add user"**.
    *   *Note: Without this, you will get an "INVALID_CLIENT: Invalid redirect URI" or "User not registered in the Developer Dashboard" error.*

## 4. Configure Soulmate
1.  Open the `.env` file in the root of the Soulmate project.
2.  Paste your Client ID:
    ```env
    VITE_SPOTIFY_CLIENT_ID=your_pasted_client_id_here
    ```
3.  Restart the application (`npm run dev`) if it's running.
