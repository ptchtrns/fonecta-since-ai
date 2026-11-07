import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import { For } from 'solid-js';
import { FeatureBento } from '~/components/landing/FeatureBento';
import { ProductPreview } from '~/components/landing/ProductPreview';
import { ConnectLogo } from '~/components/connect/ConnectLogo';
import { BrandMark } from '~/components/connect/PublisherLogo';
import { SiteHeader } from '~/components/SiteHeader';
import { getCurrentUser } from '~/queries/session';

export const route = {
  preload: () => void getCurrentUser(),
} satisfies RouteDefinition;

// Sites a Connect listing is published to, each with its logo.
const stack = ['Google', 'Facebook', 'Apple Maps', 'Tripadvisor', 'Yelp', 'HERE', 'TomTom', 'Foursquare'];

// The three steps share one 9s loop. Each card's delay shifts it by a third, so the highlight, the progress
// bar and the small demo move from Detect to Suggest to Approve and start over.
const phase = ['0s', '-6s', '-3s'];

const steps: { title: string; text: string; demo: (delay: string) => JSX.Element }[] = [
  {
    title: 'Detect',
    text: 'For every coming holiday, the agent compares what Google shows with past entries, shopping-centre hours, similar businesses and customer reviews.',
    demo: () => (
      <div class="relative overflow-hidden">
        <span
          class="absolute inset-y-0 left-0 w-1/4 animate-scan bg-linear-to-r from-transparent via-base-content/10 to-transparent"
          aria-hidden="true"
        />
        <span class="relative">Google: 07:30–18:00 · Last year: 07:30–13:00</span>
      </div>
    ),
  },
  {
    title: 'Suggest',
    text: 'Each issue becomes one concrete change with its reason and how sure the agent is, sent on WhatsApp in the owner’s own language.',
    demo: (delay) => (
      <div class="flex items-center">
        <span
          class="inline-block animate-type overflow-hidden whitespace-nowrap"
          style={{ 'animation-delay': delay }}
        >
          24.12. 07:30–13:00 · Approve?
        </span>
        <span class="ml-0.5 inline-block h-4 w-px animate-caret bg-base-content" aria-hidden="true" />
      </div>
    ),
  },
  {
    title: 'Approve',
    text: 'The owner taps Approve, Edit or No thanks, without logging in, and gets a confirmation of where the new hours show.',
    demo: (delay) => (
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span
          class="animate-pop rounded-full bg-base-content px-3 py-0.5 text-base-100"
          style={{ 'animation-delay': delay }}
        >
          Kyllä
        </span>
        <span
          class="animate-pop text-xs text-base-content/60"
          style={{ 'animation-delay': `calc(${delay} - 0.6s)` }}
        >
          ✓ Live everywhere
        </span>
      </div>
    ),
  },
];

export default function Landing() {
  return (
    <>
      <Title>Connecta AI · Keeps local businesses findable</Title>
      <SiteHeader />

      <main class="overflow-x-clip">
        <section class="relative px-4 pt-20 pb-10 sm:pt-28">
          <div class="relative mx-auto flex max-w-3xl animate-reveal flex-col items-center gap-6 text-center">
            <a
              href="#features"
              target="_self"
              class="group inline-flex items-center gap-2 rounded-full border border-base-300 bg-base-100/60 py-1 pr-3 pl-1 text-sm backdrop-blur transition-colors hover:border-base-content/30"
            >
              <span class="badge badge-sm badge-neutral">New</span>
              <span class="text-base-content/70">Fonecta challenge: Connect Suggests, Customer Approves</span>
              <span class="text-base-content/40 transition-transform group-hover:translate-x-0.5">→</span>
            </a>

            <h1 class="text-5xl font-bold tracking-tight text-balance sm:text-7xl">
              Connecta AI keeps local businesses <span class="text-base-content/50">findable.</span>
            </h1>

            <p class="max-w-xl text-lg text-pretty text-base-content/60">
              An agent notices when a local business's information is wrong, explains a fix in one WhatsApp
              message, and publishes it everywhere the moment the owner taps Approve. No dashboard to
              remember.
            </p>

            <div class="flex flex-wrap items-start justify-center gap-3">
              <a href="/dashboard" class="btn btn-primary btn-lg">
                Open Connecta AI
              </a>
              <a href="#how-it-works" target="_self" class="btn btn-lg btn-ghost border-base-300">
                How it works
              </a>
            </div>

            <p class="font-mono text-xs tracking-wide text-base-content/40">
              3,000 Nordic businesses · Finnish, Swedish, Norwegian, English · WhatsApp
            </p>
          </div>

          <div class="relative mt-16 animate-reveal [animation-delay:200ms] sm:mt-20">
            <ProductPreview />
          </div>
        </section>

        <section class="border-y border-base-300 bg-base-100/40 py-6">
          <p class="mb-4 text-center font-mono text-xs tracking-widest text-base-content/40 uppercase">
            One listing, kept right everywhere customers look
          </p>
          <div class="flex overflow-hidden mask-[linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
            <div class="flex shrink-0 animate-marquee gap-12 pr-12">
              <For each={[...stack, ...stack]}>
                {(name) => (
                  <span class="group flex items-center gap-2.5 whitespace-nowrap">
                    <BrandMark
                      name={name}
                      class="size-6 opacity-50 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                    />
                    <span class="text-lg font-semibold text-base-content/40 transition-colors group-hover:text-base-content">
                      {name}
                    </span>
                  </span>
                )}
              </For>
            </div>
          </div>
        </section>

        <FeatureBento />

        <section id="how-it-works" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
          <div class="reveal-on-scroll mb-14 flex flex-col items-center gap-4 text-center">
            <span class="badge badge-outline border-base-300 text-base-content/70">How it works</span>
            <h2 class="text-4xl font-bold tracking-tight sm:text-5xl">From problem to fixed in one text</h2>
          </div>
          <ol class="grid gap-4 md:grid-cols-3">
            <For each={steps}>
              {(step, i) => (
                <li class="reveal-on-scroll">
                  <div
                    class="card h-full animate-step-card card-border border-base-300 bg-base-100"
                    style={{ 'animation-delay': phase[i()] }}
                  >
                    <div class="card-body gap-4">
                      <span
                        class="grid size-8 animate-step-dot place-items-center rounded-full border border-base-300 font-mono text-xs"
                        style={{ 'animation-delay': phase[i()] }}
                      >
                        0{i() + 1}
                      </span>
                      <div>
                        <h3 class="text-lg font-semibold">{step.title}</h3>
                        <p class="mt-1 text-base-content/60">{step.text}</p>
                      </div>
                      <div class="mt-auto rounded-field border border-base-300 bg-base-200 px-4 py-3 font-mono text-sm">
                        {step.demo(phase[i()]!)}
                      </div>
                    </div>
                    <div class="h-0.5 overflow-hidden rounded-b-box">
                      <div
                        class="h-full origin-left animate-step-bar bg-base-content"
                        style={{ 'animation-delay': phase[i()] }}
                      />
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
                No customer should walk to a closed door.
              </h2>
              <p class="max-w-md text-base-content/60">
                Find your business, see what needs changing, and approve it with one tap.
              </p>
              <a href="/dashboard" class="btn btn-primary btn-lg">
                Open Connecta AI
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer class="border-t border-base-300">
        <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <a href="/" aria-label="Connecta AI home">
            <ConnectLogo />
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
          <p class="text-sm text-base-content/40">Prototype for the Fonecta challenge</p>
        </div>
      </footer>
    </>
  );
}
