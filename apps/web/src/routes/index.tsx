import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { For } from 'solid-js';
import { FeatureBento } from '~/components/landing/FeatureBento';
import { ProductPreview } from '~/components/landing/ProductPreview';
import { Logo } from '~/components/Logo';
import { SiteHeader } from '~/components/SiteHeader';
import { getCurrentUser } from '~/queries/session';

export const route = {
  preload: () => void getCurrentUser(),
} satisfies RouteDefinition;

const stack = ['SolidJS', 'Cloudflare Workers', 'D1', 'R2', 'Drizzle ORM', 'Better Auth', 'Tailwind CSS', 'daisyUI'];

const steps = [
  {
    title: 'Clone and install',
    text: 'One workspace with the web app, a Python worker and shared tooling.',
    command: 'pnpm install',
  },
  {
    title: 'Build locally',
    text: 'Database, file storage and auth all run on your machine. No accounts needed.',
    command: 'pnpm dev',
  },
  {
    title: 'Ship it',
    text: 'Deploy to Cloudflare’s edge in one command, ready for the judges.',
    command: 'pnpm deploy',
  },
];

export default function Landing() {
  return (
    <>
      <Title>Hackathon · Ship your idea before the demo</Title>
      <SiteHeader />

      <main class="overflow-x-clip">
        <section class="relative px-4 pt-20 pb-10 sm:pt-28">

          <div class="relative mx-auto flex max-w-3xl animate-reveal flex-col items-center gap-6 text-center">
            <a
              href="#features"
              target="_self"
              class="group inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100/60 py-1 pr-3 pl-1 text-sm backdrop-blur transition-colors hover:border-base-content/30"
            >
              <span class="badge badge-sm badge-primary">New</span>
              <span class="text-base-content/70">AI assistant built in</span>
              <span class="text-base-content/40 transition-transform group-hover:translate-x-0.5">→</span>
            </a>

            <h1 class="text-5xl font-bold tracking-tight text-balance sm:text-7xl">
              Ship your idea{' '}
              <span class="text-base-content/50">
                before the demo.
              </span>
            </h1>

            <p class="max-w-xl text-lg text-pretty text-base-content/60">
              Auth, uploads, background jobs, analytics and AI, already wired up on Cloudflare. Your weekend
              goes into the product, not the plumbing.
            </p>

            <div class="flex flex-wrap justify-center gap-3">
              <a href="/login" class="btn btn-primary btn-lg">
                Start building
              </a>
              <a href="#how-it-works" target="_self" class="btn btn-lg btn-ghost border-base-300">
                How it works
              </a>
            </div>

            <p class="font-mono text-xs tracking-wide text-base-content/40">
              Open source · Runs locally · Deploys in one command
            </p>
          </div>

          <div class="relative mt-16 animate-reveal [animation-delay:200ms] sm:mt-20">
            <ProductPreview />
          </div>
        </section>

        <section class="border-y border-base-300 bg-base-100/40 py-6">
          <p class="mb-4 text-center font-mono text-xs tracking-widest text-base-content/40 uppercase">
            Built on tools you already trust
          </p>
          <div class="flex overflow-hidden mask-[linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
            <div class="flex shrink-0 animate-marquee gap-12 pr-12">
              <For each={[...stack, ...stack]}>
                {(name) => (
                  <span class="text-lg font-semibold whitespace-nowrap text-base-content/40">{name}</span>
                )}
              </For>
            </div>
          </div>
        </section>

        <FeatureBento />

        <section id="how-it-works" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
          <div class="reveal-on-scroll mb-14 flex flex-col items-center gap-4 text-center">
            <span class="badge badge-outline border-base-300 text-base-content/70">How it works</span>
            <h2 class="text-4xl font-bold tracking-tight sm:text-5xl">From zero to live in three steps</h2>
          </div>
          <ol class="grid gap-4 md:grid-cols-3">
            <For each={steps}>
              {(step, i) => (
                <li class="reveal-on-scroll card card-border border-base-300 bg-base-100">
                  <div class="card-body gap-4">
                    <span class="font-mono text-sm text-primary">0{i() + 1}</span>
                    <div>
                      <h3 class="text-lg font-semibold">{step.title}</h3>
                      <p class="mt-1 text-base-content/60">{step.text}</p>
                    </div>
                    <div class="mt-auto rounded-field border border-base-300 bg-base-200 px-4 py-3 font-mono text-sm">
                      <span class="text-base-content/40 select-none">$ </span>
                      {step.command}
                    </div>
                  </div>
                </li>
              )}
            </For>
          </ol>
        </section>

        <section class="px-4 pb-24">
          <div class="reveal-on-scroll relative mx-auto max-w-6xl overflow-hidden rounded-box border border-base-300 bg-base-100 px-6 py-20 text-center">
            <div class="relative flex flex-col items-center gap-5">
              <h2 class="max-w-2xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">
                The clock is running. Start shipping.
              </h2>
              <p class="max-w-md text-base-content/60">
                Create an account and you’ll be inside a working dashboard in seconds.
              </p>
              <a href="/login" class="btn btn-primary btn-lg">
                Create an account
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer class="border-t border-base-300">
        <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <a href="/" class="flex items-center gap-2 font-semibold">
            <Logo />
            Hackathon
          </a>
          <nav class="flex gap-6 text-sm text-base-content/60">
            <a href="#features" target="_self" class="hover:text-base-content">
              Features
            </a>
            <a href="#how-it-works" target="_self" class="hover:text-base-content">
              How it works
            </a>
            <a href="/login" class="hover:text-base-content">
              Sign in
            </a>
          </nav>
          <p class="text-sm text-base-content/40">© {new Date().getFullYear()} Hackathon</p>
        </div>
      </footer>
    </>
  );
}
