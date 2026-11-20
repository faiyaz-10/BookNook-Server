# BookNook API

Express API with MongoDB persistence and Better Auth JWT/JWKS verification. See the root README for full setup and deployment instructions.

```bash
npm install
cp .env.example .env
npm run dev
```

For production, configure `MONGODB_URI`, `DB_NAME`, `CLIENT_ORIGIN`, `BETTER_AUTH_BASE_URL`, and the private `IMGBB_API_KEY`. `CLIENT_ORIGIN` and `BETTER_AUTH_BASE_URL` should be the exact frontend origin, such as `https://booknook.vercel.app` (no trailing slash). The API verifies bearer tokens using that origin's `/api/auth/jwks` endpoint.

On Vercel, keep the project root at this repository root. Vercel detects the Express Function from the root `index.js`; it exports the existing app in `src/app.js`. No `vercel.json` or backend build script is required. Set `NODE_ENV=production` and do not set `PORT` for the Vercel Function runtime. MongoDB initialization is shared per warm function instance, including concurrent first requests. First-request initialization also checks indexes and normalizes legacy data, so its duration depends on the existing collection size and your Vercel Function duration limit. `/health` returns HTTP 200 when MongoDB is connected and HTTP 503 when it is unavailable.

Set `MONGODB_URI` to the Atlas connection string, `DB_NAME` to the backend database name, `CLIENT_ORIGIN` and `BETTER_AUTH_BASE_URL` to the exact production frontend origin (for example `https://booknook.vercel.app`, without a trailing slash), and `IMGBB_API_KEY` to the private upload key. `BETTER_AUTH_BASE_URL` is used to retrieve `/api/auth/jwks` and validate token issuer and audience. Local development continues to use `npm run dev`, with `CLIENT_ORIGIN` and `BETTER_AUTH_BASE_URL` set to `http://localhost:3000`.


## Seed sample books

After setting `MONGODB_URI` in `.env`, run `npm run seed` from this server directory. It inserts 18 shared sample books and is safe to rerun without creating duplicates. Users can borrow and return these books; the existing ownership rules keep shared seed records read-only.
