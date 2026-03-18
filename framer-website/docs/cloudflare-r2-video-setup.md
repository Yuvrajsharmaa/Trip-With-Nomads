# Cloudflare R2 Video Setup

This project currently serves the hero video from Supabase Storage. That is fine for low traffic, but it burns through Supabase egress quickly because the live asset is a public marketing video.

## Current State

- Public video delivery is now on Cloudflare R2.
- Production media host: `media.tripwithnomads.com`
- `r2.dev` public access is disabled.
- Framer defaults point at Cloudflare-hosted video URLs.
- Cache and firewall rules are already active on the media host.

Use Cloudflare R2 for public video delivery and keep Supabase for:

- database
- auth
- edge functions
- private or app-owned files

## Target setup

- Bucket: `tripwithnomads-videos`
- Custom domain: `media.tripwithnomads.com`
- Object key pattern: `videos/<filename>.mp4`
- Framer URL pattern: `https://media.tripwithnomads.com/videos/<filename>.mp4`

Example:

```text
https://media.tripwithnomads.com/videos/herovideo_compressed.mp4
```

## Why this setup

- Cloudflare R2 has free Internet egress.
- A custom domain is the recommended production path for public buckets.
- Using a dedicated media subdomain keeps asset hosting separate from the app domain.

Official references:

- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/buckets/public-buckets/

## One-time Cloudflare setup

1. Add `tripwithnomads.com` to the same Cloudflare account that will own the R2 bucket.
2. Create an R2 bucket named `tripwithnomads-videos`.
3. In the bucket settings, add the custom domain `media.tripwithnomads.com`.
4. Wait for the domain status to change to `Active`.
5. Do not use the `r2.dev` URL for production traffic.

Cloudflare notes:

- Public `r2.dev` access is intended for non-production use.
- A custom domain is the correct production setup if you want caching and normal edge controls.

## Recommended cache config

Add a cache rule for:

```text
media.tripwithnomads.com/*
```

Use a policy equivalent to:

- Cache eligibility: eligible
- Edge TTL: 1 year
- Cache key: ignore query string
- Respect origin headers for content type

The uploaded objects should also carry:

- `Cache-Control: public, max-age=31536000, immutable`
- `Content-Type: video/mp4`

For versioned video filenames like `hero-v2.mp4`, aggressive caching is fine.

## Uploading a video

After logging in with Wrangler:

```bash
npx wrangler login
node ./scripts/upload_r2_video.mjs \
  --bucket tripwithnomads-videos \
  --file "/Users/yuvrajsharma/Downloads/Framer Asset Video.compressed.mp4" \
  --key "videos/herovideo_compressed.mp4" \
  --public-base-url "https://media.tripwithnomads.com"
```

The script shells out to:

```bash
npx wrangler r2 object put tripwithnomads-videos/videos/herovideo_compressed.mp4 --file "/Users/yuvrajsharma/Downloads/Framer Asset Video.compressed.mp4"
```

## Framer cutover

The current default video URL is the Cloudflare media domain in:

- `framer-website/framer/OptimizedVideo.tsx`

The default is:

```ts
const DEFAULT_VIDEO_URL = VIDEO_HOST_DEFAULTS.cloudflare
```

That keeps the change isolated to one line.

## Verification

Run:

```bash
curl -I https://media.tripwithnomads.com/videos/herovideo_compressed.mp4
```

You want:

- `HTTP/2 200`
- `content-type: video/mp4`
- the expected `content-length`

Then load the page and confirm the Network tab shows the video coming from `media.tripwithnomads.com`, not `supabase.co`.

## Rollback

If anything is off, change the default video constant back to Supabase and republish Framer.
