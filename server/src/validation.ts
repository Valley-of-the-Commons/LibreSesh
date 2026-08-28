import { z } from 'zod';
import { badRequest } from './errors.js';
import { isValidTimezone } from './shared/time.js';

/** Trimmed string that must still have content after trimming. */
const trimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1).max(max));

const optionalTrimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().max(max));

export const displayNameSchema = trimmed(40);
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]{3,40}$/, 'Slug must be 3–40 characters of a–z, 0–9 or -');
export const passwordSchema = z.string().min(6, 'Passwords must be at least 6 characters');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const timezoneSchema = z
  .string()
  .refine(isValidTimezone, 'Unknown timezone — use an IANA name like Europe/Berlin');
export const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour like #6B7280');
/** Minute-of-day, on the 5-minute grid the calendar snaps to. */
export const minuteOfDaySchema = z.number().int().min(0).max(1440);

export const isoInstantSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Expected an ISO-8601 timestamp');

export const renameSchema = z.object({ displayName: displayNameSchema });

export const createEventSchema = z
  .object({
    name: trimmed(120),
    slug: slugSchema,
    timezone: timezoneSchema,
    startDate: dateSchema,
    endDate: dateSchema,
    dayStartMin: minuteOfDaySchema.optional(),
    dayEndMin: minuteOfDaySchema.optional(),
    viewerPassword: passwordSchema,
    userPassword: passwordSchema,
    adminPassword: passwordSchema,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must not be before the start date',
    path: ['endDate'],
  })
  .refine((v) => (v.dayEndMin ?? 1320) > (v.dayStartMin ?? 480), {
    message: 'Day end must be after day start',
    path: ['dayEndMin'],
  });

export const cloneEventSchema = z
  .object({
    newSlug: slugSchema,
    newName: trimmed(120),
    startDate: dateSchema,
    endDate: dateSchema,
    viewerPassword: passwordSchema,
    userPassword: passwordSchema,
    adminPassword: passwordSchema,
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'End date must not be before the start date',
    path: ['endDate'],
  });

export const authSchema = z.object({ password: z.string().min(1).max(200) });

export const roomSchema = z.object({
  name: trimmed(80),
  description: optionalTrimmed(500).optional(),
  capacity: z.number().int().min(0).max(100000).nullable().optional(),
  openTrack: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export const roomPatchSchema = roomSchema.partial();

export const tagSchema = z.object({
  name: trimmed(40),
  color: colorSchema.optional(),
});
export const tagPatchSchema = tagSchema.partial();

export const sessionSchema = z.object({
  roomId: z.number().int().positive(),
  type: z.enum(['official', 'open']).optional(),
  title: trimmed(120),
  description: optionalTrimmed(5000).optional(),
  speaker: optionalTrimmed(120).optional(),
  startsAt: isoInstantSchema,
  endsAt: isoInstantSchema,
  tagIds: z.array(z.number().int().positive()).max(20).optional(),
});
export const sessionPatchSchema = sessionSchema.partial().extend({
  expectedUpdatedAt: isoInstantSchema.optional(),
});

export const contributionSchema = z
  .object({
    kind: z.enum(['note', 'link', 'question']),
    body: trimmed(2000),
    url: z.string().max(2000).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'link') {
      if (!v.url) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'Links need a URL' });
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(v.url);
      } catch {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'That is not a valid URL' });
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        ctx.addIssue({ code: 'custom', path: ['url'], message: 'Only http and https links' });
      }
    } else if (v.url) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: 'Only links may carry a URL' });
    }
  });

export const hiddenSchema = z.object({ hidden: z.boolean() });

export const settingsSchema = z
  .object({
    name: trimmed(120).optional(),
    startDate: dateSchema.optional(),
    endDate: dateSchema.optional(),
    dayStartMin: minuteOfDaySchema.optional(),
    dayEndMin: minuteOfDaySchema.optional(),
    viewerPassword: passwordSchema.optional(),
    userPassword: passwordSchema.optional(),
    adminPassword: passwordSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/** Parse with a schema, converting a zod failure into a 400 with a readable message. */
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.');
    throw badRequest(path ? `${path}: ${issue?.message}` : (issue?.message ?? 'Invalid input'));
  }
  return result.data;
}
