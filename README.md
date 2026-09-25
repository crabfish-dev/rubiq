# Rubiq website

Static site for **Rubiq: Cube & Circles** (iOS), served at https://rubiq-game.pages.dev on Cloudflare Pages.

- `/` landing page
- `/privacy` privacy policy (App Store Connect → Privacy Policy URL)
- `/support` help & support (App Store Connect → Support URL)
- `/c?n=3&l=22&s=<seed>&t=<centiseconds>&m=<moves>&f=<name>` challenge links
- `/.well-known/apple-app-site-association` universal links for `RSZJQUDD8W.com.elviric.rubiq`

Deploy:

```bash
CLOUDFLARE_ACCOUNT_ID=0648aad8895ac6e9e14eabf92a90407d npx wrangler pages deploy . --project-name rubiq-game --branch main
```

After the app is live, set `APP_STORE_URL` in `config.js` and redeploy.
