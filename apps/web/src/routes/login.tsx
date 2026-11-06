import { Title } from '@solidjs/meta';
import { revalidate, useNavigate, useSearchParams } from '@solidjs/router';
import { createSignal, Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { ApiError } from '~/lib/api';
import { authClient } from '~/lib/auth-client';
import { createFormState } from '~/lib/form';
import { userKeys } from '~/queries/session';
import { signInSchema, signUpSchema } from '~/schemas/auth.schema';

type Mode = 'sign-in' | 'sign-up';

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = createSignal<Mode>('sign-in');
  const form = createFormState();

  // Only same-site paths are allowed as redirect targets.
  const target = () => {
    const value = searchParams.redirect;
    return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
      ? value
      : '/dashboard';
  };

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
    const signUp = mode() === 'sign-up';
    const payload = signUp ? form.validate(signUpSchema, input) : form.validate(signInSchema, input);
    if (!payload) return;

    return form.submit(
      async () => {
        const { error } = signUp
          ? await authClient.signUp.email(payload as typeof signUpSchema._output)
          : await authClient.signIn.email(payload);
        if (error) throw new ApiError(error.status, { message: error.message ?? 'Could not sign in' });
      },
      () => {
        revalidate(userKeys);
        navigate(target(), { replace: true });
      },
    );
  }

  function switchMode(next: Mode) {
    setMode(next);
    form.setMessage(null);
  }

  return (
    <main class="flex min-h-screen items-center justify-center p-4">
      <Title>{mode() === 'sign-in' ? 'Sign in' : 'Create account'}</Title>
      <div class="card card-border w-full max-w-md border-base-300 bg-base-100">
        <form class="card-body gap-4" onSubmit={onSubmit} novalidate>
          <a href="/" class="link link-hover text-base-content/70">
            Back to home
          </a>
          <h1 class="card-title text-2xl">{mode() === 'sign-in' ? 'Sign in' : 'Create an account'}</h1>

          <div role="tablist" class="tabs tabs-box">
            <button
              type="button"
              role="tab"
              class={['tab grow', { 'tab-active': mode() === 'sign-in' }]}
              onClick={() => switchMode('sign-in')}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              class={['tab grow', { 'tab-active': mode() === 'sign-up' }]}
              onClick={() => switchMode('sign-up')}
            >
              Sign up
            </button>
          </div>

          <FormMessage message={form.message()} />

          <Show when={mode() === 'sign-up'}>
            <FormField label="Name" error={form.fieldErrors().name}>
              <input name="name" type="text" class="input w-full" autocomplete="name" />
            </FormField>
          </Show>
          <FormField label="Email" error={form.fieldErrors().email}>
            <input name="email" type="email" class="input w-full" autocomplete="email" />
          </FormField>
          <FormField
            label="Password"
            error={form.fieldErrors().password}
            hint={mode() === 'sign-up' ? 'At least 8 characters' : undefined}
          >
            <input
              name="password"
              type="password"
              class="input w-full"
              autocomplete={mode() === 'sign-in' ? 'current-password' : 'new-password'}
            />
          </FormField>

          <button type="submit" class="btn btn-primary mt-2" disabled={form.pending()}>
            <Show when={form.pending()}>
              <span class="loading loading-spinner loading-sm" />
            </Show>
            {mode() === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}
