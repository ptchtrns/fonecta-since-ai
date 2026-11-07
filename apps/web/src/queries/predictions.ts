import { query } from '@solidjs/router';
import { apiGet, type Jsonify } from '~/lib/api';
import type { PredictionDto } from '~/services/predictions.service';

export type PredictionItem = Jsonify<PredictionDto>;

export const getPredictions = query(() => apiGet<PredictionItem[]>('/api/predictions'), 'predictions');
