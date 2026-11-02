/** Disposable loopback identity service, never deployed. No real identities. */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const codes = new Map();
const tokens = new Map();
const run = randomUUID();
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost:3201');
  if (url.pathname === '/authorize') {
    const provider = url.searchParams.get('provider');
    const callback = new URL(url.searchParams.get('redirect_uri'));
    if (callback.origin !== 'http://127.0.0.1:3213' || !['google', 'github'].includes(provider)) {
      response.writeHead(400).end();
      return;
    }
    const identity = url.searchParams.get('identity');
    if (!['alice', 'bob', 'different', 'owned'].includes(identity)) {
      response.setHeader('content-type', 'text/html');
      response.end(
        '<h1>Local substitute, not real OAuth</h1>' +
          ['alice', 'bob', 'different', 'owned']
            .map((name) => {
              const next = new URL(url);
              next.searchParams.set('identity', name);
              return `<p><a href="${next.href.replaceAll('&', '&amp;')}">Continue as ${name}</a></p>`;
            })
            .join('')
      );
      return;
    }
    const code = randomUUID();
    codes.set(code, {
      // "owned" models Bob's existing provider account after an email change.
      id: `${provider}-${identity === 'owned' ? 'bob' : identity}-${run}`,
      name: identity,
      email: `${identity === 'owned' ? 'alice' : identity}-${run}@example.invalid`,
      emailVerified: true,
    });
    callback.searchParams.set('state', url.searchParams.get('state'));
    callback.searchParams.set('code', code);
    response.writeHead(302, { location: callback.href }).end();
    return;
  }
  if (url.pathname === '/token' && request.method === 'POST') {
    let code = '';
    for await (const chunk of request) code += chunk;
    const user = codes.get(code);
    codes.delete(code);
    if (!user) {
      response.writeHead(400).end();
      return;
    }
    const token = randomUUID();
    tokens.set(token, user);
    response.end(token);
    return;
  }
  if (url.pathname === '/userinfo') {
    const user = tokens.get(request.headers.authorization?.slice(7));
    if (!user) {
      response.writeHead(401).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(user));
    return;
  }
  response.end('Local OAuth test fixture');
});
server.listen(3201, '0.0.0.0');
