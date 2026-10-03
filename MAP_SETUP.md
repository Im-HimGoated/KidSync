# KidsSync map setup

The Map panel can always open restaurant, family activity, entertainment, park, library, or custom searches in Google Maps and Apple Maps. The in-app interactive Google map additionally needs a Google Maps Platform key.

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project and enable billing. Google Maps Platform usage can incur charges; set a budget and alerts before enabling the map.
2. Enable **Maps Embed API** in **APIs & Services → Library**.
3. Create an API key in **APIs & Services → Credentials**. Set **Application restrictions** to **Websites** and add the deployed KidsSync origin, for example `https://your-domain.example/*`. Add `http://localhost:8878/*` only if you need local testing. Set **API restrictions** to **Maps Embed API**.
4. Put the restricted key in `window.KIDSSYNC_GOOGLE_MAPS.embedApiKey` in `supabase-config.js`, deploy, then reload the app. Never put a service account credential or unrestricted server key in browser code.

The app asks for location only when **Use my location** is clicked. The embedded search shows Google's live matching places; results are not an exhaustive directory. Without a configured key, KidsSync shows a setup message and the Google/Apple Maps buttons still work. The dashboard's illustrated family map is not a geographic map.
