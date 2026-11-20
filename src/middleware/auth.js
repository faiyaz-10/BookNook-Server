import { createRemoteJWKSet, jwtVerify } from 'jose';

const configuredBaseURL = process.env.BETTER_AUTH_BASE_URL?.trim();
if (!configuredBaseURL) {
  throw new Error('BETTER_AUTH_BASE_URL must be configured');
}
const base = configuredBaseURL.replace(/\/+$/, '');
const parsedBaseURL = new URL(base);
if (
  parsedBaseURL.origin !== base
  || (process.env.NODE_ENV === 'production' && parsedBaseURL.protocol !== 'https:')
) {
  throw new Error('BETTER_AUTH_BASE_URL must be an origin and use HTTPS in production');
}
const JWKS = createRemoteJWKSet(new URL(`${base}/api/auth/jwks`));

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = header.slice(7);
    const { payload } = await jwtVerify(token, JWKS, { issuer: base, audience: base });
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