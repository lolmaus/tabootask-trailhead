import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ConvexReactClient, useConvex, useMutation, useQuery } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import type { AuthClient } from '@convex-dev/better-auth/react';
import { api } from '@repo/backend/api';
import { authClient } from './auth-client.ts';

const convexUrl = import.meta.env['VITE_CONVEX_URL'] as string | undefined;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Probe({ fixtureKey }: { fixtureKey: string }) {
  if (!convex || !import.meta.env['VITE_CONVEX_SITE_URL'])
    return (
      <main>
        <h1>Backend not configured</h1>
        <p>Build with VITE_CONVEX_URL and VITE_CONVEX_SITE_URL.</p>
      </main>
    );
  // 0.12.6's published AuthClient generic infers useSession().data as never
  // with Better Auth 1.6.33. Keep this upstream type adaptation at the boundary.
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient as unknown as AuthClient}>
      <Fixture fixtureKey={fixtureKey} />
    </ConvexBetterAuthProvider>
  );
}

function Fixture({ fixtureKey }: { fixtureKey: string }) {
  const identity = useQuery(api.authProbe.identity);
  const note = useQuery(api.authProbe.read, { key: fixtureKey });
  const create = useMutation(api.authProbe.create);
  const update = useMutation(api.authProbe.update);
  const remove = useMutation(api.authProbe.remove);
  const unlinkAccount = useMutation(api.authProbe.unlinkAccount);
  const client = useConvex();
  const [source, setSource] = useState('');
  const [result, setResult] = useState('Ready');
  const [accounts, setAccounts] = useState<{ providerId: string; accountId: string }[]>([]);
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const value = await action();
      setResult(JSON.stringify(value ?? 'Success', null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  const callbackURL =
    typeof window === 'undefined' ? '/' : window.location.origin + window.location.pathname;
  return (
    <main>
      <Link to="/">Probe home</Link>
      <h1>Static OAuth fixture</h1>
      <p>
        Disposable ticket #22 evaluation. Current text is public; history and writes require the
        fixture owner.
      </p>
      <p>
        Fixture: <code>{fixtureKey}</code>
      </p>
      <p>
        Session:{' '}
        <output data-testid="identity">
          {identity === undefined ? 'Loading' : (identity?.userId ?? 'Signed out')}
        </output>
      </p>
      <fieldset disabled={busy}>
        <legend>OAuth and explicit linking</legend>
        {(['google', 'github'] as const).map((provider) => (
          <span key={provider}>
            <button
              onClick={() =>
                void run(() =>
                  authClient.signIn.social({ provider, callbackURL, errorCallbackURL: callbackURL })
                )
              }
            >
              Sign in with {provider}
            </button>
            <button
              disabled={!identity}
              onClick={() =>
                void run(() =>
                  authClient.linkSocial({ provider, callbackURL, errorCallbackURL: callbackURL })
                )
              }
            >
              Connect {provider}
            </button>
          </span>
        ))}
        <button
          onClick={() =>
            void run(async () => {
              await authClient.signOut();
              window.location.reload();
            })
          }
        >
          Sign out
        </button>
        <button disabled={!identity} onClick={() => void run(() => authClient.revokeSessions())}>
          Revoke all sessions
        </button>
        <button
          disabled={!identity}
          onClick={() =>
            void run(async () => {
              const response = await authClient.listAccounts();
              setAccounts(response.data ?? []);
              return response;
            })
          }
        >
          List sign-in methods
        </button>
        {accounts.map((account) => (
          <button
            key={account.providerId + account.accountId}
            onClick={() =>
              void run(() =>
                unlinkAccount({
                  accountId: account.accountId,
                  providerId: account.providerId as 'google' | 'github',
                })
              )
            }
          >
            Unlink {account.providerId}
          </button>
        ))}
      </fieldset>
      <section>
        <h2>Public reactive read</h2>
        <pre data-testid="public-note">
          {note === undefined ? 'Loading' : JSON.stringify(note, null, 2)}
        </pre>
      </section>
      <fieldset disabled={busy}>
        <legend>Owner boundary</legend>
        <label>
          Replacement fixture text
          <textarea
            value={source}
            onChange={(event) => setSource(event.target.value)}
            maxLength={2000}
          />
        </label>
        <button onClick={() => void run(() => create({ key: fixtureKey }))}>Create fixture</button>
        <button onClick={() => void run(() => update({ key: fixtureKey, source }))}>
          Update fixture
        </button>
        <button
          onClick={() => void run(() => client.query(api.authProbe.history, { key: fixtureKey }))}
        >
          Read restricted history
        </button>
        <button onClick={() => void run(() => remove({ key: fixtureKey }))}>Delete fixture</button>
      </fieldset>
      <h2>Last action</h2>
      <pre role="status" data-testid="action-result">
        {result}
      </pre>
    </main>
  );
}
