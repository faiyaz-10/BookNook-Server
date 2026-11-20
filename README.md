# BookNook API

Express API with MongoDB persistence and Better Auth JWT/JWKS verification. See the root README for full setup and deployment instructions.

```bash
npm install
cp .env.example .env
npm run dev
```


## Seed sample books

After setting `MONGODB_URI` in `.env`, run `npm run seed` from this server directory. It inserts 18 shared sample books and is safe to rerun without creating duplicates. Users can borrow and return these books; the existing ownership rules keep shared seed records read-only.
