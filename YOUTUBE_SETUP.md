# Connect a real YouTube channel

1. In Google Cloud, choose a project and enable YouTube Data API v3.
2. Configure the Google Auth Platform consent screen, audience and data access. During testing, add each test account. The app requests youtube.readonly when connecting. It requests youtube.force-ssl when someone chooses an action that edits their channel. Complete any Google verification required for public access.
3. Create an OAuth client of type Web application. Under Authorized JavaScript origins, enter the exact production origin and any development origin you use, such as http://localhost:3000.
4. In Vercel, set NEXT_PUBLIC_GOOGLE_CLIENT_ID to the public web client ID. Set YOUTUBE_API_KEY server-side for public search, trending, channel details and comments. Redeploy because Next.js includes the public client ID at build time.
5. Open PlayTube in a browser and select Sign in. Verify the channel name, open a playlist, then try creating a private playlist. When granting edit access, choose the action again to confirm. Use a test channel for comments and other public changes.

Google supplies a short-lived access token held in page memory. Reloading, expiration and signing out end the local session. Users can remove PlayTube's grant in their Google Account connections. Guest libraries, History and Watch Later use browser storage. Signed-in likes, subscriptions, playlist changes and comments operate on the selected YouTube channel. Shorts, Live and creator uploads open YouTube or YouTube Studio.

The Android wrapper opens the deployed site in the system browser for account access. Configure GUITARPLAY_URL in the Android build before packaging.
