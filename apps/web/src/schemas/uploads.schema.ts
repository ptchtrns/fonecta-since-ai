import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

// Browsers submit an empty, unnamed File when no file is chosen.
const emptyFileToUndefined = (value: unknown) =>
  value instanceof File && value.size === 0 && !value.name ? undefined : value;

export const uploadImageSchema = z.object({
  file: z.preprocess(
    emptyFileToUndefined,
    z
      .file({ message: 'Choose a file to upload' })
      .max(MAX_UPLOAD_BYTES, { message: 'File must be 5 MB or smaller' })
      .mime([...IMAGE_TYPES], { message: 'Only PNG, JPEG, WebP and GIF images are allowed' }),
  ),
});
export type UploadImagePayload = z.infer<typeof uploadImageSchema>;

export const uploadParamsSchema = z.object({
  id: z.string().min(1).max(64),
});
