import { z } from 'zod';

// Auth endpoints are served by Better Auth; these schemas validate the login form before sending.
const email = z.email({ message: 'Enter a valid email address' }).max(255);
const password = z
  .string()
  .min(8, { message: 'Password should be at least 8 characters long' })
  .max(100, { message: 'Password must be 100 or less characters long' });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { message: 'Enter your password' }).max(100),
});
export type SignInPayload = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  entityId: z.string().min(1, { message: 'Choose your business from the list' }).max(64),
  name: z.string().trim().min(1, { message: 'Enter your name' }).max(100),
  email,
  password,
});
export type SignUpPayload = z.infer<typeof signUpSchema>;
