import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { httpStatus } from '@solidjs/web';

export const route = {
  // Runs before the response head flushes so SSR answers with a real 404.
  preload: () => httpStatus(404),
} satisfies RouteDefinition;

export default function NotFound() {
  return (
    <main class="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Title>Page not found</Title>
      <h1 class="text-5xl font-bold">404</h1>
      <p class="text-base-content/80">This page does not exist.</p>
      <a href="/" class="btn btn-primary">
        Back to home
      </a>
    </main>
  );
}
