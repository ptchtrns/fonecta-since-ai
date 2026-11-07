import { Title } from '@solidjs/meta';
import { ChooseBusiness } from '~/components/connect/ChooseBusiness';
import { Page, PageHeader } from '~/components/connect/Page';
import { PasswordForm } from '~/components/settings/PasswordForm';
import { ProfileForm } from '~/components/settings/ProfileForm';

export default function Account() {
  return (
    <Page class="max-w-2xl">
      <Title>Account · Connecta AI</Title>
      <PageHeader title="Account" subtitle="Your sign-in details, and which business this account manages." />
      <ChooseBusiness title="Change business" />
      <ProfileForm />
      <PasswordForm />
    </Page>
  );
}
