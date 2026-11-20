# BookNook API

Express API with MongoDB persistence and Better Auth JWT/JWKS verification. See the root README for full setup and deployment instructions.

```bash
npm install
cp .env.example .env
npm run dev
```

For production, set `NODE_ENV=production` and configure `PORT`, `MONGODB_URI`, `DB_NAME`, `CLIENT_ORIGIN`, `BETTER_AUTH_BASE_URL`, and the private `IMGBB_API_KEY`. The API listens on the hosting provider's `PORT` and exposes `/health` after MongoDB connects.


## Seed sample books

After setting `MONGODB_URI` in `.env`, run `npm run seed` from this server directory. It inserts 18 shared sample books and is safe to rerun without creating duplicates. Users can borrow and return these books; the existing ownership rules keep shared seed records read-only.
