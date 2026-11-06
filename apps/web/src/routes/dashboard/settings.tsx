import { Title } from '@solidjs/meta';
import { PasswordForm } from '~/components/settings/PasswordForm';
import { ProfileForm } from '~/components/settings/ProfileForm';

export default function DashboardSettings() {
  return (
    <div class="mx-auto flex max-w-2xl flex-col gap-6">
      <Title>Settings</Title>
      <h1 class="text-3xl font-bold">Settings</h1>
      <ProfileForm />
      <PasswordForm />
    </div>
  );
}
