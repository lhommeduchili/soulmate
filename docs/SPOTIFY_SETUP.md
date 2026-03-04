# spotify developer setup guide

to enable "connect with spotify" in soulmate, you need to configure a spotify app in the developer dashboard.

## 1. create the app
1.  go to the [spotify developer dashboard](https://developer.spotify.com/dashboard) and log in.
2.  click the **"create app"** button.
3.  fill in the details:
    -   **app name:** `soulmate` (or similar)
    -   **app description:** `desktop client for djs.`
    -   **redirect uri:** `soulmate://callback` (crucial!)
    -   **which api/sdks are you planning to use?** select "web api".
4.  check the terms and click **"save"**.

## 2. get credentials
1.  on your app page, go to **"settings"**.
2.  under **"basic information"**, find the **client id**.
3.  copy this client id.

## 3. configure user access (development mode)
by default, new apps are in "development mode". you must explicitly add the spotify accounts that are allowed to log in.

1.  go to **"settings"** -> **"user management"**.
2.  click **"add user"**.
3.  enter the **name** and **email address** associated with your spotify account.
4.  click **"add user"**.
    *   *note: without this, you will get an "invalid_client: invalid redirect uri" or "user not registered in the developer dashboard" error.*

## 4. configure soulmate
1.  open the `.env` file in the root of the soulmate project.
2.  paste your client id:
    ```env
    vite_spotify_client_id=your_pasted_client_id_here
    ```
3.  restart the application (`npm run dev`) if it's running.
