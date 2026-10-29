import { z } from "zod";

export const personInputSchema = z.object({
    name: z.string().trim().min(1, "Enter a name.").max(200, "Use 200 characters or fewer."),
    email: z
        .string()
        .trim()
        .min(1, "Enter an email address.")
        .max(254, "Use 254 characters or fewer.")
        .email("Enter a valid email address."),
    age: z
        .string()
        .trim()
        .min(1, "Enter an age.")
        .refine((value) => value !== "" && Number.isFinite(Number(value)), "Enter a valid age.")
        .transform(Number)
        .pipe(
            z
                .number()
                .int("Age must be a whole number.")
                .min(0, "Age must be between 0 and 150.")
                .max(150, "Age must be between 0 and 150."),
        ),
});

export type PersonDraft = z.input<typeof personInputSchema>;
export type PersonInput = z.output<typeof personInputSchema>;

export const personSummarySchema = z.object({ id: z.uuid(), name: z.string() });
export const savedPersonSchema = personSummarySchema.extend({
    owner_id: z.uuid(),
    email: z.string(),
    age: z.number().int(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type PersonSummary = z.infer<typeof personSummarySchema>;
export type SavedPerson = z.infer<typeof savedPersonSchema>;

export function toDraft(person?: SavedPerson): PersonDraft {
    return person
        ? { name: person.name, email: person.email, age: String(person.age) }
        : { name: "", email: "", age: "" };
}

export function matchesSaved(draft: PersonDraft, saved: SavedPerson | null) {
    const result = personInputSchema.safeParse(draft);
    return (
        saved !== null &&
        result.success &&
        result.data.name === saved.name.trim() &&
        result.data.email === saved.email.trim() &&
        result.data.age === saved.age
    );
}
