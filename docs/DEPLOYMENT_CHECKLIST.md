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
AUTH_SECRET="<generate-a-random-32-char-string>"
AUTH_URL="[https://your-live-domain.com/api/auth](https://your-live-domain.com/api/auth)"

# Database (Coolify will generate this for you when you spin up Postgres)
DATABASE_URL="postgresql://user:password@host:5432/yatha"

# Authentication (Google SSO)
AUTH_GOOGLE_ID="<your-google-client-id>"
AUTH_GOOGLE_SECRET="<your-google-client-secret>"
ADMIN_EMAIL="<your-email@gmail.com>" # Grants Superuser on first login

# Cloudflare R2 (Media Storage)
R2_ACCOUNT_ID="<your-cloudflare-account-id>"
R2_ACCESS_KEY_ID="<your-r2-access-key>"
R2_SECRET_ACCESS_KEY="<your-r2-secret-key>"
R2_BUCKET_NAME="<your-bucket-name>"
NEXT_PUBLIC_R2_PUBLIC_URL="[https://pub-your-custom-r2-domain.r2.dev](https://pub-your-custom-r2-domain.r2.dev)"
```

## 3. Google Cloud Console Updates

Because your domain is changing from `localhost:3000` to a live URL, Google will block logins until you whitelist the new domain.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).

2. Navigate to **APIs & Services > Credentials**.

3. Edit your existing OAuth 2.0 Client ID.

4. Add your live domain to **Authorized JavaScript origins** (e.g., `https://archive.yourdomain.com`).

5. Add the exact callback URL to **Authorized redirect URIs** (e.g., `https://archive.yourdomain.com/api/auth/callback/google`).

## 4. The Deployment Steps (Coolify)

1. **Provision Server:** Rent a cheap Ubuntu VPS on Hetzner (e.g., CX22 or CPX21).

2. **Install Coolify:** SSH into the server and run the official Coolify installation script.

3. **Database Setup:** In the Coolify dashboard, create a new PostgreSQL 16 database. It will automatically generate a secure `DATABASE_URL`.

4. **App Setup:** Add a new resource -> "Public Repository" -> Connect your GitHub repo.

5. **Configure:** Paste the environment variables above into the Coolify Environment section. Coolify will automatically detect the `Dockerfile` we created.

6. **Deploy:** Click deploy! Coolify will build the Docker image, map the SSL certificates, and spin up your archive.