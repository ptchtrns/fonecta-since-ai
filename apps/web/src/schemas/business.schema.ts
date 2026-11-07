import { z } from 'zod';
import { importances, languages } from '~/db/schema';
import { HOURS_TEXT, WEEKDAYS, type Weekday } from '~/lib/hours';

const entityId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, { message: 'Choose your business from the list' });
export const MAX_LINKS = 10;

const hours = z.string().regex(HOURS_TEXT, { message: 'Use HH:MM for opening and closing times' });

export const businessSearchSchema = z.object({ q: z.string().trim().max(80).default('') });

export const linkBusinessSchema = z.object({ entityId });

export const businessEditSchema = z.object({
  name: z.string().trim().min(1, { message: 'Enter the business name' }).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(\+?[0-9 ()-]{7,20})?$/, { message: 'Phone number with country code, e.g. +358 40 123 4567' }),
  website: z.string().trim().max(200),
  addressLine1: z.string().trim().min(3, { message: 'Enter the street address' }).max(200),
  postalCode: z.string().trim().min(3, { message: 'Enter the postal code' }).max(12),
  description: z.string().trim().max(600),
  hours: z.object(Object.fromEntries(WEEKDAYS.map((d) => [d, hours])) as Record<Weekday, typeof hours>),
  // Pages with the business's hours, compared with every suggestion. Empty rows are dropped when saving.
  links: z
    .array(z.string().trim().max(500))
    .max(MAX_LINKS, { message: `Up to ${MAX_LINKS} links` })
    .default([]),
});
export type BusinessEditPayload = z.infer<typeof businessEditSchema>;

export const decideSchema = z.object({
  action: z.enum(['approve', 'edit', 'decline']),
  // Required for "edit": the owner's version of the hours.
  hours: hours.optional(),
});
export type DecidePayload = z.infer<typeof decideSchema>;

export const suggestionKeySchema = z.object({
  id: z.string().regex(/^(\d{4}-\d{2}-\d{2}|closed-for-good)$/),
});
export const tokenSchema = z.object({ token: z.string().min(16).max(64) });

export const whatsappSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^(\+[0-9 ]{7,20})?$/, { message: 'WhatsApp number with country code, e.g. +358 40 123 4567' }),
    language: z.enum(languages),
    on: z.boolean(),
    minImportance: z.enum(importances),
    standingPermission: z.boolean(),
  })
  .refine((w) => !w.on || w.phone.length > 0, {
    message: 'Add your WhatsApp number first',
    path: ['phone'],
  });
export type WhatsAppPayload = z.infer<typeof whatsappSchema>;
