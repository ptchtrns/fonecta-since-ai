import { Title } from '@solidjs/meta';
import { useBeforeLeave, type RouteDefinition } from '@solidjs/router';
import { createMemo, onSettled } from 'solid-js';
import { ContactPreferences } from '~/components/connect/ContactPreferences';
import { Page, PageHeader } from '~/components/connect/Page';
import { AddressChannel } from '~/components/integrations/AddressChannel';
import { TelegramChannel } from '~/components/integrations/TelegramChannel';
import { getCurrentUser } from '~/queries/session';
import { getWorkspace, type Workspace } from '~/queries/workspace';
import { emailSchema, whatsappSchema } from '~/schemas/business.schema';

export const route = {
  preload: () => void getWorkspace(),
} satisfies RouteDefinition;

export default function Integrations() {
  const workspace = createMemo(() => getWorkspace() as Promise<Workspace>);
  const user = createMemo(() => getCurrentUser());

  // Each form reports whether it has unsaved changes, so leaving the page can warn about any of them.
  const forms: (() => boolean)[] = [];
  const register = (unsaved: () => boolean) => void forms.push(unsaved);
  const unsaved = () => forms.some((f) => f());

  useBeforeLeave((event) => {
    if (!unsaved() || event.defaultPrevented) return;
    event.preventDefault();
    setTimeout(() => {
      if (window.confirm('Leave without saving your settings?')) event.retry(true);
    }, 100);
  });
  onSettled(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (unsaved()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });

  return (
    <Page class="max-w-3xl">
      <Title>Integrations · Connecta AI</Title>
      <PageHeader title="Integrations" />

      <ContactPreferences workspace={workspace()} register={register} />

      <AddressChannel
        name="WhatsApp"
        text="Answer suggestions with one tap, without logging in."
        field="phone"
        label="WhatsApp number"
        type="tel"
        placeholder="+358 40 123 4567"
        autocomplete="tel"
        saved={{
          address: workspace().whatsapp.phone,
          on: workspace().whatsapp.on,
          configured: workspace().whatsapp.configured,
        }}
        notConfigured={
          <>
            WhatsApp sending is off because the <code class="font-mono">WHATSAPP_TOKEN</code> and{' '}
            <code class="font-mono">WHATSAPP_PHONE_NUMBER_ID</code> environment variables aren't set. Your
            settings still save, and messages start once both are set.
          </>
        }
        endpoint="/api/workspace/whatsapp"
        testEndpoint="/api/workspace/whatsapp/test"
        schema={whatsappSchema}
        normalize={(value) => value.replace(/\s+/g, '')}
        register={register}
      />

      <TelegramChannel telegram={workspace().telegram} />

      <AddressChannel
        name="Email"
        text="Each suggestion with a link to answer it, without logging in."
        field="address"
        label="Email address"
        type="email"
        placeholder="owner@example.com"
        autocomplete="email"
        saved={{
          address: workspace().email.address,
          on: workspace().email.on,
          configured: workspace().email.configured,
        }}
        suggested={user()?.email}
        notConfigured={
          <>
            Email sending is off because the <code class="font-mono">RESEND_API_KEY</code> and{' '}
            <code class="font-mono">RESEND_FROM</code> environment variables aren't set. Your settings still
            save, and emails start once both are set.
          </>
        }
        endpoint="/api/workspace/email"
        testEndpoint="/api/workspace/email/test"
        schema={emailSchema}
        register={register}
      />
    </Page>
  );
}
