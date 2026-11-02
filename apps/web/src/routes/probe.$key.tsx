import { createFileRoute } from '@tanstack/react-router';
import { Probe } from '../probe.tsx';
export const Route = createFileRoute('/probe/$key')({ ssr: false, component: FixtureRoute });
function FixtureRoute() {
  const { key } = Route.useParams();
  return <Probe fixtureKey={key} />;
}
