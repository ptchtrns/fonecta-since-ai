import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { upload, type Upload } from '~/db/schema';
import { err, ok } from '~/lib/result';
import { db } from '~/server/db';

export type UploadDto = Upload & { url: string };

const toDto = (row: Upload): UploadDto => ({ ...row, url: `/api/files/${row.key}` });

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function listUploads(userId: string) {
  const rows = await db
    .select()
    .from(upload)
    .where(eq(upload.userId, userId))
    .orderBy(desc(upload.createdAt));
  return ok(rows.map(toDto));
}

/** Stores the file in R2 under an unguessable key and records it in D1. */
export async function createUpload(userId: string, file: File) {
  const id = crypto.randomUUID();
  const key = `${userId}/${id}.${EXTENSIONS[file.type] ?? 'bin'}`;

  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { userId, fileName: file.name },
  });

  try {
    const [row] = await db
      .insert(upload)
      .values({ id, userId, key, fileName: file.name, contentType: file.type, size: file.size })
      .returning();
    return ok(toDto(row!));
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
}

export async function deleteUpload(userId: string, id: string) {
  const [row] = await db
    .delete(upload)
    .where(and(eq(upload.id, id), eq(upload.userId, userId)))
    .returning({ key: upload.key });

  if (!row) return err({ reason: 'UploadNotFound' as const });
  await env.BUCKET.delete(row.key);
  return ok(null);
}

export async function getFile(key: string, request: Request) {
  const object = await env.BUCKET.get(key, {
    onlyIf: request.headers,
    range: request.headers.has('range') ? request.headers : undefined,
  });
  if (!object) return err({ reason: 'FileNotFound' as const });
  return ok(object);
}
