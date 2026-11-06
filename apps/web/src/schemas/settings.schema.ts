import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Name is required' })
    .max(100, { message: 'Name must be 100 or less characters long' }),
});
export type UpdateProfilePayload = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  oldPassword: z.string().max(100, { message: 'Password must be 100 or less characters long' }),
  newPassword: z
    .string()
    .min(8, { message: 'Password should be at least 8 characters long' })
    .max(100, { message: 'Password must be 100 or less characters long' }),
});
export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;
