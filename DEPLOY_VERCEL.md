# Vercel deployment

This repository is intentionally split into 3 independent Vercel apps.

Create three Vercel projects from the same GitHub repository:

- Customer → Root Directory: `customer`
- Waiter → Root Directory: `waiter`
- Admin → Root Directory: `admin`

Do not use `customer/..` or the repository root as the Root Directory.

Each app now imports its own `shared/` folder, so Vercel does not need to read files outside the selected Root Directory.

For local testing, use a local HTTP server (for example VS Code Live Server) and open:
- `/customer/`
- `/waiter/`
- `/admin/`

Do not open the HTML files with a `file://` URL; ES modules and the PWA service worker require HTTP(S).
