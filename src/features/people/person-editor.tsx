import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Circle, LoaderCircle, Save, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorNotice, Loading } from "@/components/feedback";
import { cn } from "@/lib/utils";
import {
    matchesSaved,
    personInputSchema,
    toDraft,
    type PersonDraft,
    type PersonInput,
    type SavedPerson,
} from "./model";
import type { PeopleRepository } from "./repository";
import { peopleKeys } from "./query-keys";

type EditorProps = {
    ownerId: string;
    selectedId: string | null;
    draftId: string;
    repository: PeopleRepository;
    operation: "save" | "delete" | "export" | null;
    onSave: (id: string, input: PersonInput) => Promise<SavedPerson>;
    onDelete: (id: string) => Promise<void>;
    onSaved: (person: SavedPerson) => void;
    onDeleted: () => void;
    onUnavailable: () => void;
};

export function PersonEditor(props: EditorProps) {
    // Keep a new draft's editor when its stable ID enters the URL after Save.
    // This preserves newer edits when a failed snapshot is retried.
    const [initialSelection] = useState(props.selectedId);
    const [recordId] = useState(props.selectedId ?? props.draftId);
    return initialSelection ? (
        <SavedPersonEditor {...props} selectedId={initialSelection} />
    ) : (
        <PersonForm {...props} id={recordId} />
    );
}

function SavedPersonEditor(props: EditorProps & { selectedId: string }) {
    const { repository, selectedId, ownerId, onUnavailable } = props;
    const query = useQuery({
        queryKey: peopleKeys.detail(ownerId, selectedId),
        queryFn: ({ signal }) => repository.get(selectedId, signal),
        refetchOnMount: "always",
    });
    // Hydrate once from this selection's fresh response. Later refetches must not
    // reset the form's draft (including when the cache changes in the background).
    const [initialPerson, setInitialPerson] = useState<SavedPerson | null | undefined>(undefined);
    useEffect(() => {
        if (initialPerson === null) onUnavailable();
    }, [initialPerson, onUnavailable]);

    if (initialPerson === undefined && query.isSuccess && !query.isFetching) {
        setInitialPerson(query.data);
    }

    if (initialPerson === undefined || initialPerson === null) {
        return (
            <div className="editor-state">
                <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                    <UserRound className="size-5" aria-hidden="true" />
                </div>
                <h2 className="mb-3 text-xl font-semibold tracking-tight">Person details</h2>
                {query.isError ? (
                    <ErrorNotice
                        onRetry={() => {
                            void query.refetch();
                        }}
                    >
                        Could not load this person. Please try again.
                    </ErrorNotice>
                ) : (
                    <Loading>Loading person…</Loading>
                )}
            </div>
        );
    }
    return <PersonForm {...props} id={selectedId} initialPerson={initialPerson} />;
}

function PersonForm({
    id,
    initialPerson,
    operation,
    onSave,
    onDelete,
    onSaved,
    onDeleted,
}: EditorProps & { id: string; initialPerson?: SavedPerson }) {
    const [confirmed, setConfirmed] = useState<SavedPerson | null>(initialPerson ?? null);
    const [failure, setFailure] = useState<"save" | "delete" | null>(null);
    const [failedInput, setFailedInput] = useState<PersonInput | null>(null);
    const form = useForm<PersonDraft, unknown, PersonInput>({
        resolver: zodResolver(personInputSchema),
        defaultValues: toDraft(initialPerson),
        reValidateMode: "onChange",
    });
    const watched = useWatch({ control: form.control });
    const isSaved = matchesSaved(
        {
            name: watched.name ?? "",
            email: watched.email ?? "",
            age: watched.age ?? "",
        },
        confirmed,
    );
    const writing = operation === "save" || operation === "delete";
    const busy = operation !== null;
    const errors = form.formState.errors;

    async function submit(input: PersonInput) {
        setFailure(null);
        setFailedInput(null);
        try {
            const saved = await onSave(id, input);
            setConfirmed(saved);
            if (matchesSaved(form.getValues(), saved)) form.reset(toDraft(saved));
            onSaved(saved);
        } catch {
            setFailedInput(input);
            setFailure("save");
        }
    }

    async function remove() {
        setFailure(null);
        try {
            await onDelete(id);
            onDeleted();
        } catch {
            setFailure("delete");
        }
    }

    return (
        <form noValidate onSubmit={form.handleSubmit(submit)} className="flex min-h-[570px] flex-col">
            <div className="editor-heading">
                <div className="flex items-stretch gap-3.5">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary">
                        <UserRound className="size-5" strokeWidth={1.7} aria-hidden="true" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <h2 className="text-xl font-semibold tracking-tight">
                            {confirmed ? "Edit person" : "New person"}
                        </h2>
                    </div>
                </div>
                <span
                    role="status"
                    aria-live="polite"
                    className={cn(
                        "inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-xs font-medium",
                        isSaved
                            ? "border-emerald-200/70 bg-emerald-50 text-emerald-700"
                            : "border-border bg-secondary/70 text-muted-foreground",
                    )}
                >
                    {isSaved ? (
                        <Check className="size-3" aria-hidden="true" />
                    ) : (
                        <Circle className="size-2 fill-current" aria-hidden="true" />
                    )}
                    {isSaved ? "Saved" : "Unsaved"}
                </span>
            </div>

            <div className="editor-fields">
                <fieldset disabled={writing} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="person-name" className="field-label">
                            Name
                        </label>
                        <Input
                            id="person-name"
                            autoComplete="name"
                            placeholder="e.g. Alex Morgan"
                            aria-invalid={Boolean(errors.name)}
                            aria-describedby={errors.name ? "name-error" : undefined}
                            {...form.register("name")}
                        />
                        {errors.name && (
                            <p id="name-error" className="field-error">
                                {errors.name.message}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="person-email" className="field-label">
                            Email
                        </label>
                        <Input
                            id="person-email"
                            type="email"
                            autoComplete="email"
                            placeholder="alex@example.com"
                            aria-invalid={Boolean(errors.email)}
                            aria-describedby={errors.email ? "email-error" : undefined}
                            {...form.register("email")}
                        />
                        {errors.email && (
                            <p id="email-error" className="field-error">
                                {errors.email.message}
                            </p>
                        )}
                    </div>
                    <div className="max-w-44 space-y-2">
                        <label htmlFor="person-age" className="field-label">
                            Age
                        </label>
                        <Input
                            id="person-age"
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="150"
                            step="1"
                            placeholder="e.g. 28"
                            aria-invalid={Boolean(errors.age)}
                            aria-describedby={errors.age ? "age-error" : "age-help"}
                            {...form.register("age")}
                        />
                        {errors.age ? (
                            <p id="age-error" className="field-error">
                                {errors.age.message}
                            </p>
                        ) : (
                            <p id="age-help" className="text-xs text-muted-foreground">
                                Between 0 and 150 years.
                            </p>
                        )}
                    </div>
                </fieldset>
                {failure && (
                    <div className="mt-6">
                        <ErrorNotice
                            onRetry={() => {
                                if (failure === "save" && failedInput) void submit(failedInput);
                                else if (failure === "delete") void remove();
                            }}
                        >
                            {failure === "save"
                                ? "Could not save this person. Your changes are still here."
                                : "Could not delete this person. The record has been kept."}
                        </ErrorNotice>
                    </div>
                )}
            </div>

            <div className="editor-actions">
                <p className="mr-auto text-xs leading-relaxed text-muted-foreground">
                    {isSaved ? "Your changes are saved." : "Changes are saved when you’re ready."}
                </p>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    {confirmed && (
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => {
                                void remove();
                            }}
                        >
                            {operation === "delete" ? (
                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                            ) : (
                                <Trash2 aria-hidden="true" />
                            )}
                            {operation === "delete" ? "Deleting…" : "Delete person"}
                        </Button>
                    )}
                    <Button type="submit" disabled={busy}>
                        {operation === "save" ? (
                            <LoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : (
                            <Save aria-hidden="true" />
                        )}
                        {operation === "save" ? "Saving…" : "Save person"}
                    </Button>
                </div>
            </div>
        </form>
    );
}
