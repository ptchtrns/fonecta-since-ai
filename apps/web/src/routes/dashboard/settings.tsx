import { Title } from '@solidjs/meta';
import { ChooseBusiness } from '~/components/connect/ChooseBusiness';
import { Page, PageHeader } from '~/components/connect/Page';
import { PasswordForm } from '~/components/settings/PasswordForm';
import { ProfileForm } from '~/components/settings/ProfileForm';

export default function DashboardSettings() {
  return (
    <Page class="max-w-2xl">
      <Title>Settings · Connecta AI</Title>
      <PageHeader title="Settings" />
      <ChooseBusiness title="Change business" />
      <ProfileForm />
      <PasswordForm />
    </Page>
  );
}
