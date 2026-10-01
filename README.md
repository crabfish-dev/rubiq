# Rubiq website

Static site for **Rubiq: Cube & Circles**, served at https://rubiq.crabfish.dev (Cloudflare Workers static assets; also reachable at rubiq-game.crabfish.workers.dev). The existing iOS pages remain at their original paths. The user authorized Android-specific website additions on 30 September 2026; iOS app code is outside this change.

- `/` landing page
- `/privacy` privacy policy (App Store Connect → Privacy Policy URL)
- `/support` help & support (App Store Connect → Support URL)
- `/c?n=3&l=22&s=<seed>&t=<centiseconds>&m=<moves>&f=<name>` challenge links
- `/.well-known/apple-app-site-association` universal links for `RSZJQUDD8W.com.elviric.rubiq`
- `/android/` Android developer landing page, published by Santosh A
- `/android/privacy` Android privacy policy, effective 30 September 2026
- `/android/support` Android help and contact, santu0002@gmail.com
- `/app-ads.txt` public Google AdMob authorized-seller record, served as plain text

Android pages distinguish optional adult rewarded ads from the iOS edition's no-ads behavior. Under-18 players receive the three extra backgrounds free. The Android release is still described as in preparation; no unverified Play download URL is included. The policy also explains local progress, age choices, Google consent processing and this site's Cloudflare hosting.

Expected Android policy URL after deployment: `https://rubiq.crabfish.dev/android/privacy`. Use `https://rubiq.crabfish.dev` as the Play developer website so AdMob can discover the root `/app-ads.txt`. These additions must be verified publicly after deployment; local files do not establish that the new URLs are live.

The existing static Worker uses Cloudflare's default [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/): `android/index.html` serves `/android/`, and `android/privacy.html` serves `/android/privacy`. No Worker name, routing configuration, challenge script, App Store setting or Apple association change is needed.

Deploy:

```bash
cd /Users/santosha/Documents/elvi/rubiq/site
CLOUDFLARE_ACCOUNT_ID=0648aad8895ac6e9e14eabf92a90407d npx wrangler deploy
```

The latest reported Wrangler authentication check in this directory failed because the token was expired and could not refresh. Changing directories does not restore authentication. The main task owns authentication and deployment; these website edits did not deploy anything or access credentials.

After the app is live, set `APP_STORE_URL` in `config.js` and redeploy.

`.assetsignore` keeps `.git`, `wrangler.jsonc` and this README off the public site.

Local validation on 30 September 2026 checked eight HTML pages and every local page, asset and anchor link with no broken links. The authorized-seller file exactly matches the Android release source. SHA-256 checks confirmed the existing `c.html`, `config.js`, `wrangler.jsonc`, Apple association file and all four image assets are unchanged. Public routing, visual rendering and the AdMob crawler result remain deployment checks.
