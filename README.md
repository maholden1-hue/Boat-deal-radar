# Boat Deal Radar - Full Deployable Version

A mobile-first Progressive Web App (PWA) plus backend search service for Houston-area bay boat deals.

## Included

- iPhone-friendly PWA with Home Screen icon
- Express backend and REST API
- SQLite database with price history
- Favorites, Interested and Pass states
- Scheduled searches at 8:00 AM and 4:00 PM Central
- Houston-area radius filtering
- Hard ceiling of $50,000
- 20+ ft, 150+ hp, 6+ practical seating
- Deal score
- Estimated original new value
- Estimated fair value today
- Estimated accessory value new and today
- Cost-to-complete and effective all-in price
- Exact listing verification before a listing is retained
- Optional Brave Search API discovery
- Dockerfile and Render deployment blueprint

## Important

The search engine does not bypass access controls. It discovers public listing URLs through Brave Search and then fetches exact pages that are publicly retrievable. Sources that block automated access will simply fail verification and will not be included.

The valuation model is heuristic. Treat it as a screening tool, not an appraisal.

## Quick local test

1. Install Node.js 20+
2. Copy `.env.example` to `.env`
3. Optional: add a Brave Search API key to `BRAVE_API_KEY`
4. Run:

   npm install
   node seed.js
   npm start

5. Open `http://localhost:3000`

## Live search

Add a Brave Search API key in `.env`:

   BRAVE_API_KEY=your_key_here

Then either tap the API manually or run:

   npm run search

The server will also run searches automatically at 8:00 AM and 4:00 PM America/Chicago.

## Deploy to Render

1. Create a free/paid Render account.
2. Create a new Web Service from a GitHub repository containing these files, or use the included `render.yaml`.
3. Add environment variable:
   `BRAVE_API_KEY`
4. For persistent SQLite storage, attach a persistent disk and set:
   `DB_PATH=/var/data/boats.db`
5. Deploy.
6. Open the HTTPS site in Safari on iPhone.
7. Share > Add to Home Screen.

## Better production database

For a long-term version, replace SQLite with Postgres/Supabase. The current package is deliberately self-contained so it is easy to deploy and understand.

## API

- `GET /api/health`
- `GET /api/leads?minScore=80`
- `GET /api/leads/:id/history`
- `POST /api/leads/:id/favorite`
- `POST /api/leads/:id/status`
- `POST /api/search/run`
- `POST /api/import-url` with JSON `{ "url": "https://..." }`

## Search criteria

Current defaults:
- Houston radius: 100 miles
- Maximum ask: $50,000
- Minimum length: 20 ft
- Minimum horsepower: 150
- Minimum practical seating: 6
- Minimum score: 80
- Preferences: T-top, trolling motor, Power-Pole/Talon, jack plate
