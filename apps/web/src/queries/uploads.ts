import { query } from '@solidjs/router';
import { apiGet, type Jsonify } from '~/lib/api';
import type { UploadDto } from '~/services/uploads.service';

export type UploadItem = Jsonify<UploadDto>;

export const getUploads = query(() => apiGet<UploadItem[]>('/api/uploads'), 'uploads');
