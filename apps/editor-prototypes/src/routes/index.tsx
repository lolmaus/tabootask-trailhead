import { lazy, Suspense, useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Lab } from '../lab.tsx';
const CollaborationLab = lazy(() => import('../collaboration/lab.tsx'));
function Index() {
  const [probe, setProbe] = useState(false);
  useEffect(() => {
    setProbe(new URLSearchParams(window.location.search).get('lab') === 'collaboration');
  }, []);
  return probe ? (
    <Suspense fallback={<p>Opening collaboration probe…</p>}>
      <CollaborationLab />
    </Suspense>
  ) : (
    <Lab />
  );
}
export const Route = createFileRoute('/')({ component: Index });
