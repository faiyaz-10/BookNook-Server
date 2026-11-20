import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import test from 'node:test';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const authModuleURL = new URL('../src/middleware/auth.js', import.meta.url);

function importAuthInSubprocess(environment) {
  const script = `await import(${JSON.stringify(authModuleURL.href)});`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serverRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

test('normalizes Better Auth origins and rejects invalid production configuration', () => {
  const development = importAuthInSubprocess({
    NODE_ENV: 'development',
    VERCEL: '',
    BETTER_AUTH_BASE_URL: '',
  });
  assert.equal(development.status, 0, development.stderr);

  const productionOrigin = importAuthInSubprocess({
    NODE_ENV: 'production',
    VERCEL: '1',
    BETTER_AUTH_BASE_URL: 'https://frontend.example/',
  });
  assert.equal(productionOrigin.status, 0, productionOrigin.stderr);

  for (const invalidOrigin of [
    'https://frontend.example/api/auth',
    'https://frontend.example?next=/',
    'http://localhost:3000',
    '',
  ]) {
    const invalid = importAuthInSubprocess({
      NODE_ENV: 'production',
      VERCEL: '1',
      BETTER_AUTH_BASE_URL: invalidOrigin,
    });
    assert.notEqual(invalid.status, 0, `${invalidOrigin || '(missing)'} should be rejected`);
  }
});

test('validates JWT signature, issuer, audience, and expiration through JWKS', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: 'booknook-test',
    alg: 'RS256',
    use: 'sig',
  };
  let jwksRequests = 0;
  const jwksServer = createServer((req, res) => {
    if (req.url !== '/api/auth/jwks') {
      res.writeHead(404).end();
      return;
    }
    jwksRequests += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));

  const previousEnvironment = {
    BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
  };
  const base = `http://127.0.0.1:${jwksServer.address().port}`;
  process.env.BETTER_AUTH_BASE_URL = base;
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL;

  try {
    const moduleURL = new URL(authModuleURL);
    moduleURL.searchParams.set('test', 'jwks');
    const { requireAuth } = await import(moduleURL.href);

    async function verify(token) {
      const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
      let nextCalled = false;
      const originalConsoleError = console.error;
      console.error = () => {};
      try {
        await requireAuth(req, res, () => {
          nextCalled = true;
        });
      } finally {
        console.error = originalConsoleError;
      }
      return { req, res, nextCalled };
    }

    async function signToken({
      issuer = base,
      audience = base,
      expiration = '1h',
      signingKey = privateKey,
    } = {}) {
      const token = new SignJWT({ email: 'Reader@example.com', name: 'Reader' })
        .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject('user-1');
      if (expiration !== null) token.setExpirationTime(expiration);
      return token.sign(signingKey);
    }

    assert.equal((await verify()).res.statusCode, 401);
    assert.equal((await verify('not-a-jwt')).res.statusCode, 401);
    assert.equal((await verify(await signToken({ expiration: 1 }))).res.statusCode, 401);
    assert.equal((await verify(await signToken({ expiration: null }))).res.statusCode, 401);
    assert.equal((await verify(await signToken({ issuer: 'https://wrong.example' }))).res.statusCode, 401);
    assert.equal((await verify(await signToken({ audience: 'https://wrong.example' }))).res.statusCode, 401);

    const { privateKey: wrongPrivateKey } = await generateKeyPair('RS256');
    assert.equal((await verify(await signToken({ signingKey: wrongPrivateKey }))).res.statusCode, 401);

    const accepted = await verify(await signToken());
    assert.equal(accepted.nextCalled, true);
    assert.equal(accepted.req.user.email, 'reader@example.com');
    assert.equal(accepted.req.user.subject, 'user-1');
    assert.ok(jwksRequests > 0);
  } finally {
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve, reject) => {
      jwksServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
