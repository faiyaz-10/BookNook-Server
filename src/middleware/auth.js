import { createRemoteJWKSet, jwtVerify } from 'jose';

const configuredBaseURL = process.env.BETTER_AUTH_BASE_URL?.trim()
  || (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null);
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
if (!configuredBaseURL) {
  throw new Error('BETTER_AUTH_BASE_URL must be configured');
}
if (!/^[a-z][a-z\d+.-]*:\/\/[^/?#]+\/?$/i.test(configuredBaseURL)) {
  throw new Error('BETTER_AUTH_BASE_URL must be an origin without a path, query, or fragment');
}
let parsedBaseURL;
try {
  parsedBaseURL = new URL(configuredBaseURL);
} catch {
  throw new Error('BETTER_AUTH_BASE_URL must be a valid URL origin');
}
const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsedBaseURL.hostname);
const isLocalDevelopmentURL = !isProduction
  && parsedBaseURL.protocol === 'http:'
  && isLoopback;
if (
  parsedBaseURL.pathname !== '/'
  || parsedBaseURL.search
  || parsedBaseURL.hash
  || parsedBaseURL.username
  || parsedBaseURL.password
  || (parsedBaseURL.protocol !== 'https:' && !isLocalDevelopmentURL)
) {
  throw new Error(
    'BETTER_AUTH_BASE_URL must be an HTTPS origin in production; HTTP is allowed only for localhost outside production',
  );
}
const base = parsedBaseURL.origin;
const JWKS = createRemoteJWKSet(new URL('/api/auth/jwks', `${base}/`));

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = header.slice(7);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: base,
      audience: base,
      requiredClaims: ['exp'],
    });
    const email = typeof payload.email === 'string' ? payload.email : null;
    const name = typeof payload.name === 'string' ? payload.name : '';
    if (!email) {
      return res.status(401).json({ message: 'Invalid authentication token' });
    }

    req.user = { email: email.toLowerCase(), name, subject: payload.sub };
    return next();
  } catch (error) {
    console.error(
      'JWT verification failed:',
      error instanceof Error ? error.message : String(error),
    );
    return res.status(401).json({
      message: 'Invalid or expired token. Please sign in again.',
    });
  }
}