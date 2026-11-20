import express from 'express';
import cors from 'cors';
import booksRouter from './routes/books.js';
import borrowsRouter from './routes/borrows.js';
import imagesRouter from './routes/images.js';
import { connectDB, isDBConnected } from './db.js';
import { requireAuth } from './middleware/auth.js';

const clientOrigin = process.env.CLIENT_ORIGIN?.trim();
if (!clientOrigin) {
  throw new Error('CLIENT_ORIGIN must be configured');
}
const configuredOrigins = clientOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (!configuredOrigins.length) {
  throw new Error('CLIENT_ORIGIN must contain at least one origin');
}
for (const origin of configuredOrigins) {
  const parsedOrigin = new URL(origin);
  if (
    parsedOrigin.origin !== origin
    || parsedOrigin.hostname.includes('*')
    || (process.env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:')
  ) {
    throw new Error('CLIENT_ORIGIN must contain exact origins and use HTTPS in production');
  }
}
if (process.env.NODE_ENV === 'production' && !process.env.IMGBB_API_KEY) {
  throw new Error('IMGBB_API_KEY must be configured in production');
}

const app = express();
app.use(cors({
  origin(origin, callback) {
    if (
      !origin
      || configuredOrigins.includes(origin)
      || (process.env.NODE_ENV === 'development' && /^http:\/\/localhost:\d+$/.test(origin))
    ) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error('Failed to initialize MongoDB for request:', error);
    if (req.path === '/health') {
      return res.status(503).json({
        status: 'degraded',
        service: 'BookNook API',
        database: 'disconnected',
      });
    }
    const unavailableError = new Error('Database is temporarily unavailable');
    unavailableError.status = 503;
    return next(unavailableError);
  }
});
app.get('/health', (req, res) => {
  const database = isDBConnected() ? 'connected' : 'disconnected';
  return res.status(database === 'connected' ? 200 : 503).json({
    status: database === 'connected' ? 'ok' : 'degraded',
    service: 'BookNook API',
    database,
  });
});
// The assignment's GET /books supports a private ?mine=true mode while the ordinary list remains public.
app.use('/books', (req, res, next) => {
  if (req.method === 'GET' && req.query.mine === 'true') {
    return requireAuth(req, res, next);
  }
  return next();
}, booksRouter);
app.use('/borrows', borrowsRouter);
app.use('/images', imagesRouter);
app.use((req, res) => res.status(404).json({ message: 'API route not found' }));
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  const message = error.type === 'entity.parse.failed'
    ? 'Invalid JSON request body'
    : status === 413
      ? 'Request body is too large'
      : status === 503
        ? 'Service temporarily unavailable'
        : 'Internal server error';
  return res.status(status).json({ message });
});
export default app;
