# Cloudflare Change Log

## 2026-03-18

- Migrated public marketing videos from Supabase Storage to Cloudflare R2 bucket `tripwithnomads-videos`.
- Connected the production custom domain `media.tripwithnomads.com` to the R2 bucket.
- Disabled public `r2.dev` access after production domain activation.
- Updated the Framer video component default to use `https://media.tripwithnomads.com/videos/herovideo_compressed.mp4`.
- Re-uploaded the migrated videos with long-lived cache headers:
  - `Cache-Control: public, max-age=31536000, immutable`
  - `Content-Type: video/mp4`
- Added a Cloudflare cache rule for `media.tripwithnomads.com/videos/*` with:
  - `Edge TTL: 1 year`
  - `Browser TTL: 1 year`
  - query strings excluded from the cache key
- Added a Cloudflare firewall custom rule using `Managed Challenge` for common probe paths on `media.tripwithnomads.com`:
  - `.env`
  - `wp-json`
  - `docker`
  - `vscode`
  - `checkout`
  - `config`

## Notes

- The site zone `tripwithnomads.com` is active on Cloudflare.
- The production media URL is live and serving over HTTPS.
- The change was made to reduce Supabase bandwidth usage and keep video delivery on Cloudflare.
