# BookNook Server

BookNook Server is the REST API for BookNook, a community library application. It provides the backend services for browsing a shared book catalogue, adding and managing reader-submitted books, borrowing and returning copies, and uploading book-cover images. Book records and borrow activity are stored in MongoDB, and protected operations use Better Auth-issued JWTs.

## Deployed API

**Base URL:** [https://book-nook-server-chi.vercel.app](https://book-nook-server-chi.vercel.app)

For example, the public book catalogue is available at `https://book-nook-server-chi.vercel.app/books`.

## Features

- Browse the public book catalogue and retrieve an individual book by its MongoDB ID.
- Add books with a title, author, category, cover image URL, description, and copy count.
- Edit or remove books you added, with ownership checks and protections for books that are currently borrowed.
- Borrow available copies for a seven-day loan period, and view your active borrow records.
- Return borrowed copies individually, including partial returns for multi-copy borrows.
- Upload book-cover images through ImgBB using an authenticated multipart upload.
- Verify Better Auth JWTs against the auth server's JSON Web Key Set (JWKS) before allowing protected actions.
- Keep book availability and active borrow records consistent with copy limits and duplicate-borrow safeguards.
- Seed the catalogue with 18 shared sample books using a rerunnable seed command.
- Provide a health endpoint that reports whether MongoDB is connected.

## Technologies

- **Runtime:** Node.js (ES modules)
- **Web framework:** Express 4
- **Database and driver:** MongoDB Atlas and the official MongoDB Node.js driver
- **Authentication:** Better Auth JWTs, verified with `jose` and remote JWKS
- **Image hosting:** ImgBB
- **Middleware and development tools:** CORS, dotenv, Multer, and Nodemon
- **Testing:** Node.js built-in test runner
- **Deployment:** Vercel

## API reference

All paths below are relative to the deployed base URL. JSON endpoints accept and return JSON unless noted otherwise. Protected endpoints require `Authorization: Bearer <JWT>`.

| HTTP method | Endpoint | Purpose | Authentication |
| --- | --- | --- | --- |
| `GET` | `/health` | Check API and MongoDB availability. Returns `200` when connected and `503` when degraded. | No |
| `GET` | `/books` | List public books, newest first. An optional `limit` query parameter caps the results at 100. | No |
| `GET` | `/books?mine=true` | List only books created by the authenticated user. | Yes |
| `GET` | `/books/:id` | Retrieve one book by its MongoDB ObjectId. | No |
| `POST` | `/books` | Create a book owned by the authenticated user. | Yes |
| `PATCH` | `/books/:id` | Update a book you own. The request must include `title`, `author`, `category`, `image`, and `description`; `totalCopies` is optional. | Yes |
| `DELETE` | `/books/:id` | Delete a book you own, provided it has no active borrows. | Yes |
| `POST` | `/borrows` | Borrow one or more available copies of a book. | Yes |
| `GET` | `/borrows` | List your active borrow records and outstanding copy counts. | Yes |
| `DELETE` | `/borrows/:id` | Return copies from one of your active borrow records. | Yes |
| `POST` | `/images` | Upload one image as multipart form data with the field name `image`; returns the hosted image URL. | Yes |

Book categories are `Fiction`, `Science`, `History`, `Kids`, and `Others`. Book fields have validation and length limits; a new book requires a positive whole-number `totalCopies`. Borrow and return quantities must also be positive whole numbers. Image uploads accept image MIME types up to 5 MB.

### Example requests and responses

#### Health check

```bash
curl https://book-nook-server-chi.vercel.app/health
```

```json
{
  "status": "ok",
  "service": "BookNook API",
  "database": "connected"
}
```

#### List books

```bash
curl "https://book-nook-server-chi.vercel.app/books?limit=10"
```

The response has a `books` array. Public book responses omit the internal `userEmail` field.

```json
{
  "books": [
    {
      "_id": "64f000000000000000000001",
      "title": "The Hobbit",
      "author": "J. R. R. Tolkien",
      "category": "Kids",
      "image": "https://example.com/book-cover.jpg",
      "description": "A fantasy adventure.",
      "totalCopies": 5,
      "availableCopies": 5
    }
  ]
}
```

#### Create a book

Replace `<JWT>` with a valid Better Auth access token.

```bash
curl -X POST "https://book-nook-server-chi.vercel.app/books" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "A Sample Book",
    "author": "A. Writer",
    "category": "Fiction",
    "image": "https://example.com/cover.jpg",
    "description": "A short description of the book.",
    "totalCopies": 3
  }'
```

On success, the API responds with HTTP `201`:

```json
{
  "message": "Book created",
  "book": {
    "_id": "64f000000000000000000002",
    "title": "A Sample Book",
    "author": "A. Writer",
    "category": "Fiction",
    "image": "https://example.com/cover.jpg",
    "description": "A short description of the book.",
    "totalCopies": 3,
    "availableCopies": 3,
    "userName": "Reader",
    "userEmail": "reader@example.com",
    "createdAt": "2025-01-01T12:00:00.000Z"
  }
}
```

#### Borrow and return copies

`quantity` is optional when borrowing or returning and defaults to `1`.

```bash
curl -X POST "https://book-nook-server-chi.vercel.app/borrows" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"bookId":"64f000000000000000000001","quantity":2}'
```

Borrowing succeeds with HTTP `201` and returns a `borrow` record containing the book details, `borrowDate`, and a `returnDate` seven days later. The book's `availableCopies` is decremented.

Return some or all of the copies using the borrow record ID:

```bash
curl -X DELETE "https://book-nook-server-chi.vercel.app/borrows/<BORROW_ID>" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"quantity":1,"expectedReturnedQuantity":0}'
```

The optional `expectedReturnedQuantity` lets the server detect stale or concurrent return attempts. A successful response includes `returnedCopies`, `returnedQuantity`, `remainingQuantity`, and the book's latest available-copy count.

#### Upload a book-cover image

```bash
curl -X POST "https://book-nook-server-chi.vercel.app/images" \
  -H "Authorization: Bearer <JWT>" \
  -F "image=@./cover.jpg"
```

A successful upload returns:

```json
{
  "image": "https://i.ibb.co/example/cover.jpg"
}
```

## Authentication and JWT verification

The frontend authenticates users with Better Auth and sends its JWT to protected API routes in the `Authorization` header:

```http
Authorization: Bearer <JWT>
```

The backend obtains the Better Auth JWKS from:

```text
<BETTER_AUTH_BASE_URL>/api/auth/jwks
```

Using `jose`, the API verifies the token's signature against that key set, checks that the issuer and audience match the configured auth origin, and requires a valid expiration claim. A token must also contain an email claim. The email is normalized to lowercase and used as the user's identity for book ownership and borrow records. Missing, invalid, or expired credentials receive HTTP `401`; an authenticated user attempting to change another user's book or borrow receives HTTP `403`.

Set `BETTER_AUTH_BASE_URL` to the **frontend/Better Auth origin**, not the BookNook API URL. It must be an origin without a path, query, or fragment. Production requires HTTPS. In local development only, it defaults to `http://localhost:3000` if omitted.

## Database

The API connects to MongoDB using `MONGODB_URI` and uses `DB_NAME` for the database name (default: `booknook`). It uses the `books` and `borrows` collections. At initialization, it creates indexes for common catalogue and borrow queries, enforces one active borrow per user and book, and normalizes certain legacy copy-count and borrow-status fields.

MongoDB Atlas is recommended for local and deployed use. Add the deployment host to the Atlas network access allowlist and ensure the database user has the required read/write permissions. Atlas clusters support the transactions used for coordinated return operations; the API also includes a guarded fallback for MongoDB deployments without transaction support.

### Seed sample books

After configuring `MONGODB_URI`, run:

```bash
npm run seed
```

The command inserts 18 shared sample books. It can be rerun without duplicating existing sample records or resetting their copy counts.

## Environment variables

Copy `.env.example` to `.env` for local development and replace placeholders with your own values. Never commit `.env` or expose private keys in frontend code.

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_ENV` | Recommended | Use `development` locally and `production` in deployment. Development mode permits localhost origins for CORS. |
| `PORT` | No | Local HTTP port; defaults to `5000`. Vercel manages the function port, so do not configure this for the Vercel deployment. |
| `MONGODB_URI` | Yes | MongoDB Atlas connection URI. Use the placeholder format below and keep the real credentials private. |
| `DB_NAME` | No | MongoDB database name; defaults to `booknook`. |
| `CLIENT_ORIGIN` | Yes | One or more exact frontend origins, separated by commas if needed. Use HTTPS origins in production. |
| `BETTER_AUTH_BASE_URL` | Yes in production | Frontend/Better Auth origin used to retrieve JWKS and validate JWT issuer and audience. Defaults to `http://localhost:3000` only when `NODE_ENV=development`. |
| `IMGBB_API_KEY` | Required in production | Private ImgBB API key used for image uploads. Image uploads return HTTP `503` if it is missing in local development. |

Example local `.env` values (placeholders only):

```dotenv
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/?retryWrites=true&w=majority
DB_NAME=booknook
CLIENT_ORIGIN=http://localhost:3000
BETTER_AUTH_BASE_URL=http://localhost:3000
IMGBB_API_KEY=<your-private-imgbb-api-key>
```

For Vercel, configure the variables in the backend project's Environment Variables settings. Use the actual frontend HTTPS origin for both `CLIENT_ORIGIN` and `BETTER_AUTH_BASE_URL`; do not set the auth base URL to the backend API origin.

## Installation and local development

Requirements: a supported Node.js version with native `fetch`, `FormData`, and `Blob` (Node.js 18 or newer), npm, and access to a MongoDB database.

```bash
npm install
```

Create your local environment file from the example:

```bash
copy .env.example .env
```

Edit `.env` with your MongoDB Atlas URI and frontend origin. `IMGBB_API_KEY` is needed to use image uploads; it is required to start the application in production.

Start the API with automatic restarts:

```bash
npm run dev
```

The local API listens on `http://localhost:5000` by default. Check `http://localhost:5000/health` to verify the database connection. To start without Nodemon, run `npm start`.

Run the test suite with:

```bash
npm test
```

The existing tests cover Better Auth origin configuration and JWT signature, issuer, audience, and expiration verification.

## Deployment to Vercel

1. Create a Vercel project using this backend repository and keep the project root set to the repository root.
2. Add the production environment variables: `MONGODB_URI`, `DB_NAME` (optional), `CLIENT_ORIGIN`, `BETTER_AUTH_BASE_URL`, `IMGBB_API_KEY`, and `NODE_ENV=production`.
3. Set `CLIENT_ORIGIN` and `BETTER_AUTH_BASE_URL` to the exact HTTPS origin of the frontend that uses Better Auth.
4. Confirm the MongoDB Atlas network access and database user settings permit the deployed function to connect.
5. Deploy and verify `https://book-nook-server-chi.vercel.app/health`.

The root `index.js` exports the Express app from `src/app.js` for Vercel's function runtime. The `start` and `dev` scripts are for running the server locally; Vercel manages the deployed function lifecycle.

## Project structure

```text
.
├── index.js                 # Vercel entry point
├── src/
│   ├── app.js               # Express app, CORS, middleware, and route mounting
│   ├── db.js                # MongoDB connection, initialization, and indexes
│   ├── server.js            # Local HTTP server startup and shutdown
│   ├── seedBooks.js         # Idempotent sample-book seeder
│   ├── middleware/
│   │   └── auth.js          # Better Auth JWT/JWKS verification
│   └── routes/
│       ├── books.js         # Book catalogue and ownership operations
│       ├── borrows.js       # Borrow and return operations
│       └── images.js        # Authenticated ImgBB image uploads
├── test/
│   └── auth.test.js         # Authentication configuration and JWT tests
├── .env.example             # Environment variable template
└── package.json             # Dependencies and npm scripts
```
