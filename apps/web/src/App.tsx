import { useIsRouting } from '@solidjs/router';
import { Errored, Loading, Show } from 'solid-js';
import { Router } from '~/router';
import './app.css';

export default function App() {
  return (
    <Router>
      {(props) => (
        <>
          <RouteProgress />
          <Errored
            fallback={(error, reset) => (
              <main class="flex min-h-screen items-center justify-center p-6">
                <div role="alert" class="alert alert-error max-w-lg">
                  <span>
                    {error() instanceof Error ? (error() as Error).message : 'Something went wrong'}
                  </span>
                  <button class="btn btn-sm" onClick={reset}>
                    Try again
                  </button>
                </div>
              </main>
            )}
          >
            <Loading fallback={<PageSpinner />}>{props.children}</Loading>
          </Errored>
        </>
      )}
    </Router>
  );
}

/** Thin bar at the top of the page while a navigation loads code and data. */
function RouteProgress() {
  const isRouting = useIsRouting();
  return (
    <Show when={isRouting()}>
      <progress class="progress progress-primary fixed inset-x-0 top-0 z-50 h-1 rounded-none" />
    </Show>
  );
}

function PageSpinner() {
  return (
    <div class="flex min-h-screen items-center justify-center">
      <span class="loading loading-spinner loading-lg" />
    </div>
  );
}
