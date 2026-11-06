import 'server-only';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

export const db = drizzle(env.DB);
export type Database = typeof db;
