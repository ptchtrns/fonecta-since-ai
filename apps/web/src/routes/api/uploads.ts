import { uploadImageSchema } from '~/schemas/uploads.schema';
import { currentUser, json, unauthorized, validationFailed, type ApiEvent } from '~/server/http';
import { createUpload, listUploads } from '~/services/uploads.service';

export async function GET(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const [, uploads] = await listUploads(user.id);
  return json({ data: uploads });
}

export async function POST(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const form = await event.request.formData().catch(() => null);
  const validation = uploadImageSchema.safeParse({ file: form?.get('file') });
  if (!validation.success) return validationFailed(validation.error, uploadImageSchema);

  const [, upload] = await createUpload(user.id, validation.data.file);
  return json({ message: 'Image uploaded', data: upload }, 201);
}
