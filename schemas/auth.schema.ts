import { z } from "zod";

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(EMAIL_REGEX, { message: "Please enter a valid email." });

// Note: no .trim() on passwords — leading/trailing whitespace must be preserved
// so signup and signin behave identically.
const strongPassword = z
  .string()
  .min(8, { message: "Be at least 8 characters long" })
  .regex(/[a-zA-Z]/, { message: "Contain at least one letter." })
  .regex(/[0-9]/, { message: "Contain at least one number." })
  .regex(/[^a-zA-Z0-9]/, {
    message: "Contain at least one special character.",
  });

export const SignupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, { message: "Name is too short." })
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, {
      message: "Please enter both your first and last name.",
    }),
  email: emailField,
  password: strongPassword,
});

export const SigninSchema = z.object({
  email: emailField,
  password: z.string().min(1, { message: "Password is required." }),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type SigninInput = z.infer<typeof SigninSchema>;
