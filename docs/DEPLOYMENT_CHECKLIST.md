# Yathā: Production Deployment Guide (Hetzner + Coolify)

## 1. Codebase Preparation

Before pushing to production, you **must** configure Next.js to build in standalone mode.
Open your `next.config.ts` (or `.mjs`) and ensure it includes this:

```
typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // ... any other existing config
};
export default nextConfig;
```

## 2. Production Environment Variables

When setting up the project in Coolify (or manually via Docker), you will need to provide these exact environment variables.
*Do NOT commit these to GitHub! Enter them directly into your server dashboard.*

```
# Application
NODE_ENV="production"
LICENSEE_NAME="Your Institution Name"
LICENSE_EXPIRY="" # Optional: YYYY-MM-DD to lock the instance
ADMIN_EMAIL="<your-email@gmail.com>" # Grants Superuser on first login

# Authentication (Google SSO & Auth.js)
AUTH_SECRET="<generate-a-random-32-char-string>"
AUTH_URL="[https://archive.yourdomain.com/api/auth](https://archive.yourdomain.com/api/auth)"
AUTH_TRUST_HOST="true"
AUTH_GOOGLE_ID="<your-google-client-id>"
AUTH_GOOGLE_SECRET="<your-google-client-secret>"

# Database
DATABASE_URL="postgresql://user:password@host:5432/yatha"

# Cloudflare R2 (Media Storage)
S3_ENDPOINT="https://<your-cloudflare-account-id>.r2.cloudflarestorage.com"
S3_ACCESS_KEY_ID="<your-r2-access-key>"
S3_SECRET_ACCESS_KEY="<your-r2-secret-key>"
S3_BUCKET_NAME="<your-bucket-name>"
NEXT_PUBLIC_R2_PUBLIC_URL="[https://pub-your-custom-r2-domain.r2.dev](https://pub-your-custom-r2-domain.r2.dev)"
```

## 3. SSL & Middlebox Interference (Crucial!)

You **MUST** assign a domain name and enable HTTPS (SSL) via Coolify/Traefik immediately upon deployment.

**Why?** Yathā heavily utilizes Next.js App Router and Livewire-style chunked-encoding for its API payloads. If you try to access the application via a raw IP address over unencrypted HTTP (e.g., `http://5.78.xxx.xxx:8000`), local Antivirus software (like Bitdefender) or corporate firewalls will intercept the unencrypted stream, attempt to scan it, and silently drop the TCP connection.

This results in the UI freezing with white screens and throwing `ERR_CONTENT_LENGTH_MISMATCH` or `ERR_INCOMPLETE_CHUNKED_ENCODING` errors.

**The Fix:** Wrap the application in an SSL certificate so the stream is encrypted, making it mathematically invisible to packet-tampering middleboxes.

## 4. Google Cloud Console Updates

Because your domain is changing from `localhost:3000` to a live URL, Google will block logins until you whitelist the new domain.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Navigate to **APIs & Services > Credentials**.
3. Edit your existing OAuth 2.0 Client ID.
4. Add your live domain to **Authorized JavaScript origins** (e.g., `https://archive.yourdomain.com`).
5. Add the exact callback URL to **Authorized redirect URIs** (e.g., `https://archive.yourdomain.com/api/auth/callback/google`).

## 5. The Deployment Steps (Coolify)

1. **Provision Server:** Rent an Ubuntu VPS on Hetzner (e.g., CX22 or CPX21).
2. **Install Coolify:** SSH into the server and run the official Coolify installation script.
3. **Database Setup:** In the Coolify dashboard, create a new PostgreSQL 16 database. It will automatically generate a secure internal `DATABASE_URL` for your app container to use.
4. **Initialize Postgres Schema:** Before your app can run, the tables must be created. In Coolify, go to your new database and temporarily enable public access (Public Port). Copy the provided **Public Postgres URL**. On your local computer, paste this URL into your `.env` file as `DATABASE_URL` and run `npx drizzle-kit push` to instantly build the schema. Afterward, turn off public access in Coolify for security.
5. **App Setup:** Add a new resource -> "Public Repository" -> Connect your GitHub repo.
6. **Configure:** Paste the environment variables above into the Coolify Environment section. Coolify will automatically detect the `Dockerfile` we created.
7. **Deploy:** Click deploy! Coolify will build the Docker image, map the SSL certificates, and spin up your archive.