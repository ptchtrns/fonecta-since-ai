import { uploadParamsSchema } from '~/schemas/uploads.schema';
import {
  currentUser,
  json,
  notFound,
  unauthorized,
  unexpected,
  validationFailed,
  type ApiEvent,
} from '~/server/http';
import { deleteUpload } from '~/services/uploads.service';

export async function DELETE(event: ApiEvent) {
  const user = currentUser(event);
  if (!user) return unauthorized();

  const validation = uploadParamsSchema.safeParse(event.params);
  if (!validation.success) return validationFailed(validation.error, uploadParamsSchema);

  const [error] = await deleteUpload(user.id, validation.data.id);
  if (error) {
    switch (error.reason) {
      case 'UploadNotFound':
        return notFound('Upload not found');
      default:
        return unexpected();
    }
  }

  return json({ message: 'Upload deleted' });
}
