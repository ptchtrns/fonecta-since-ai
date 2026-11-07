import { Title } from '@solidjs/meta';
import type { RouteDefinition } from '@solidjs/router';
import { createMemo } from 'solid-js';
import { ChooseBusiness } from '~/components/connect/ChooseBusiness';
import { Page, PageHeader } from '~/components/connect/Page';
import { PasswordForm } from '~/components/settings/PasswordForm';
import { ProfileForm } from '~/components/settings/ProfileForm';
import { getWorkspace, type Workspace } from '~/queries/workspace';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

export default function Account() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const current = () => {
    const b = workspace().business;
    return { id: b.id, name: b.name, address: b.addressLine1, city: b.city, source: b.source };
  };

  return (
    <Page class="max-w-2xl">
      <Title>Account · Connecta AI</Title>
      <PageHeader title="Account" subtitle="Your sign-in details, and which business this account manages." />
      <ChooseBusiness title="Change business" current={current()} />
      <ProfileForm />
      <PasswordForm />
    </Page>
  );
}
