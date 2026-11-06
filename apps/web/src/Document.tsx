import { HydrationScript } from '@solidjs/web';
import type { ParentProps } from 'solid-js';

// HTML shell around <App />. Replaces index.html in start mode.
export default function Document(props: ParentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <title>Hackathon Template</title>
        <HydrationScript />
      </head>
      <body class="min-h-screen bg-base-200 text-base-content">{props.children}</body>
    </html>
  );
}
