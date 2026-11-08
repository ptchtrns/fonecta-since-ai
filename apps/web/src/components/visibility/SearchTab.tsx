import { Show } from 'solid-js';
import { Checklist, checkSegments, NextStep } from '~/components/connect/Checklist';
import { Card, ScoreCard, SegmentBar, StatCard } from '~/components/connect/Metrics';
import { nextStep, pointsToGain } from '~/lib/visibility';
import type { Workspace } from '~/queries/workspace';

/** Local search: how well the profile can rank on Google, what to do next, and a preview of the result. */
export function SearchTab(props: { workspace: Workspace }) {
  const presence = () => props.workspace.presence;
  const report = () => presence().search;
  const missing = () => report().checks.filter((c) => !c.done).length;
  const reviews = () => presence().reviews;

  return (
    <>
      <div class="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <ScoreCard
          label="Local search score"
          aside={`${report().checks.length - missing()} of ${report().checks.length} done`}
          value={report().score}
          of="/ 100"
          text="Google ranks local businesses on how well they match the search, how close they are, and how well known they are. Complete details and reviews are the parts you control."
        >
          <SegmentBar segments={checkSegments(report().checks)} />
          <Show when={nextStep(report().checks)}>{(step) => <NextStep check={step()} />}</Show>
        </ScoreCard>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <StatCard
            label="Reviews"
            value={reviews().count ? `${reviews().averageRating.toFixed(1)} ★` : '—'}
            text={`${
              reviews().count
                ? `From ${reviews().count} ${reviews().count === 1 ? 'review' : 'reviews'}.`
                : 'No reviews yet. Google ranks reviewed places higher.'
            }${
              presence().peerReviews
                ? ` Similar businesses: ${Math.round(presence().peerReviews!.count)}, ${presence().peerReviews!.averageRating.toFixed(1)} ★.`
                : ''
            }`}
          />
          <StatCard
            label="Points to gain"
            value={missing() ? `+${pointsToGain(report().checks)}` : '0'}
            text={
              missing()
                ? `From ${missing()} ${missing() === 1 ? 'thing' : 'things'} still missing`
                : 'Everything Google weighs that you control is done'
            }
          />
        </div>
      </div>

      <div class="grid items-start gap-4 lg:grid-cols-[1fr_18rem]">
        <Card label="What helps you rank" aside={`${report().checks.length} checks`}>
          <Checklist checks={report().checks} />
        </Card>
        <Card label="How you look on Google" aside="Preview">
          <GooglePreview workspace={props.workspace} />
        </Card>
      </div>
    </>
  );
}

/** Roughly how the business shows in Google's local results, from the same data Google gets. */
function GooglePreview(props: { workspace: Workspace }) {
  const b = () => props.workspace.business;
  const reviews = () => props.workspace.presence.reviews;
  const action = (enabled: boolean) => ['btn btn-xs', !enabled && 'btn-disabled'];

  return (
    <div class="flex flex-col gap-3">
      <div class="rounded-box border border-base-300 p-4 text-sm">
        <p class="text-lg leading-tight font-semibold">{b().name}</p>
        <p class="mt-1 text-base-content/70">
          <Show when={reviews().count} fallback="No reviews">
            {reviews().averageRating.toFixed(1)} ★ ({reviews().count})
          </Show>{' '}
          · {b().category}
        </p>
        <p class="text-base-content/70">
          {b().addressLine1}, {b().postalCode} {b().city}
        </p>
        <p class="text-base-content/70">{props.workspace.presence.openingNow}</p>
        <Show when={b().description}>
          <p class="mt-2 line-clamp-3 text-base-content/60">{b().description}</p>
        </Show>
        <div class="mt-3 flex flex-wrap gap-2" aria-hidden="true">
          <span class={action(!!b().phone)}>Call</span>
          <span class={action(!!b().addressLine1)}>Directions</span>
          <span class={action(!!b().website)}>Website</span>
        </div>
      </div>
      <p class="text-xs text-base-content/50">
        Greyed-out buttons don’t show on Google until the detail is added.
      </p>
    </div>
  );
}
