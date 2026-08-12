# AniSkolar Frontend

Frontend client for AniSkolar (Scholarship Management Portal), built with React + TypeScript + Vite.

## Current Auth Model

AniSkolar now uses **Clerk** authentication:

- Students sign in via Microsoft SSO through Clerk.
- Admin accounts use Clerk-managed credentials.
- App session state is driven by Clerk status + backend profile lookup.

## Requirements

- Node.js (LTS recommended)
- npm
- Running AniSkolar backend API (default `http://localhost:5000`)
- Clerk publishable key

## Setup

```bash
cd AniSkolar_Frontend
npm install
```

Create `.env` from `.env.example`, then set:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL` (default `http://localhost:5000`)

## Run

```bash
npm run dev
```

Frontend default URL:

```text
http://localhost:3000
```

## Build

```bash
npm run build
```

## Project Structure

```text
AniSkolar_Frontend/
├── src/
│   ├── components/
│   ├── data/
│   ├── layouts/
│   ├── pages/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
└── package.json
```

## Runtime Flow (Summary)

1. User signs in through Clerk.
2. App calls backend `GET /api/students/me`.
3. If profile exists, show student portal.
4. If profile is missing, route to profile completion page.
5. Scholarship applications are submitted to backend `/api/applications`.

For full architecture details, see [architecture-overview.md](D:/AniSkolar/docs/architecture-overview.md).