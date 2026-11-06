import { revalidate } from '@solidjs/router';
import { createMemo, For, refresh, Show } from 'solid-js';
import { FormField } from '~/components/FormField';
import { FormMessage } from '~/components/FormMessage';
import { DateTime } from '~/components/DateTime';
import { apiSend } from '~/lib/api';
import { formatBytes } from '~/lib/format';
import { createFormState } from '~/lib/form';
import { getUploads, type UploadItem } from '~/queries/uploads';
import { IMAGE_TYPES, uploadImageSchema } from '~/schemas/uploads.schema';

export function UploadsPanel() {
  const uploads = createMemo(() => getUploads());
  const form = createFormState();

  function reload() {
    revalidate(getUploads.key);
    return refresh(uploads);
  }

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const formElement = event.currentTarget as HTMLFormElement;
    const data = new FormData(formElement);
    if (!form.validate(uploadImageSchema, { file: data.get('file') })) return;

    return form.submit(async () => {
      const { message } = await apiSend<UploadItem>('/api/uploads', 'POST', data);
      formElement.reset();
      return message;
    }, reload);
  }

  function remove(id: string) {
    return form.submit(async () => {
      const { message } = await apiSend('/api/uploads/' + id, 'DELETE', {});
      return message;
    }, reload);
  }

  return (
    <section class="card card-border border-base-300 bg-base-100">
      <div class="card-body gap-4">
        <div>
          <h2 class="card-title">Images</h2>
          <p class="text-base-content/70">Stored in R2 and served from /api/files.</p>
        </div>

        <form class="flex flex-col gap-3 sm:flex-row sm:items-start" onSubmit={onSubmit} novalidate>
          <div class="grow">
            <FormField label="Image" error={form.fieldErrors().file} hint="PNG, JPEG, WebP or GIF up to 5 MB">
              <input name="file" type="file" accept={IMAGE_TYPES.join(',')} class="file-input w-full" />
            </FormField>
          </div>
          <button type="submit" class="btn btn-primary sm:mt-8" disabled={form.pending()}>
            <Show when={form.pending()}>
              <span class="loading loading-spinner loading-sm" />
            </Show>
            Upload
          </button>
        </form>

        <FormMessage message={form.message()} />

        <Show
          when={uploads().length > 0}
          fallback={<p class="text-base-content/70">No images yet. Upload one to see it here.</p>}
        >
          <div class="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            <For each={uploads()} keyed={(upload) => upload.id}>
              {(upload) => (
                <figure class="card card-border overflow-hidden border-base-300 bg-base-100">
                  <a href={upload().url} target="_blank" rel="noreferrer">
                    <img
                      src={upload().url}
                      alt={upload().fileName}
                      loading="lazy"
                      class="aspect-square w-full object-cover"
                    />
                  </a>
                  <figcaption class="flex flex-col gap-1 p-3">
                    <span class="truncate font-medium" title={upload().fileName}>
                      {upload().fileName}
                    </span>
                    <span class="text-base-content/70">{formatBytes(upload().size)}</span>
                    <span class="text-base-content/70">
                      <DateTime value={upload().createdAt} />
                    </span>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm btn-error mt-1 self-start"
                      onClick={() => remove(upload().id)}
                    >
                      Delete
                    </button>
                  </figcaption>
                </figure>
              )}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
}
