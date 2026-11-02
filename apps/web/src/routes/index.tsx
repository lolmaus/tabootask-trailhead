import { createFileRoute, Link } from '@tanstack/react-router';
export const Route = createFileRoute('/')({
  component: () => (
    <main>
      <h1>Static Start + Convex OAuth probe</h1>
      <p>
        Disposable evaluation for ticket #22. Fixture content is public. Use test identities and
        non-sensitive text.
      </p>
      <Link to="/probe/$key" params={{ key: 't22-evaluation' }}>
        Open the nested fixture route
      </Link>
    </main>
  ),
});
