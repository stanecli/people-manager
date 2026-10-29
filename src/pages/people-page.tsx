import { AppHeader } from "@/components/app-header";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CsvExport } from "../features/people/csv-export";
import type { PersonInput, PersonSummary, SavedPerson } from "../features/people/model";
import { PeopleList } from "../features/people/people-list";
import { PersonEditor } from "../features/people/person-editor";
import { peopleKeys } from "../features/people/query-keys";
import { createPeopleRepository } from "../features/people/repository";
import { usePersonSelection } from "../features/people/selection";

type Operation = "save" | "delete" | "export";

export function PeoplePage({ ownerId }: { ownerId: string }) {
    const repository = useMemo(() => createPeopleRepository(ownerId), [ownerId]);
    const client = useQueryClient();
    const [operation, setOperation] = useState<Operation | null>(null);
    const writing = operation === "save" || operation === "delete";
    const { selectedId, navigate } = usePersonSelection(writing);
    const [draftId, setDraftId] = useState(() => crypto.randomUUID());
    const locked = useRef(false);
    const editorKey = selectedId ?? draftId;
    const activeEditor = useRef<string | null>(editorKey);
    useLayoutEffect(() => {
        activeEditor.current = editorKey;
        return () => {
            activeEditor.current = null;
        };
    }, [editorKey]);

    const save = useMutation({
        mutationFn: ({ id, input }: { id: string; input: PersonInput }) => repository.save(id, input),
        onSuccess: async (person) => {
            await Promise.all([
                client.cancelQueries({ queryKey: peopleKeys.list(ownerId) }),
                client.cancelQueries({
                    queryKey: peopleKeys.detail(ownerId, person.id),
                }),
            ]);
            client.setQueryData(peopleKeys.detail(ownerId, person.id), person);
            client.setQueryData<PersonSummary[]>(peopleKeys.list(ownerId), (previous) =>
                previous
                    ? [...previous.filter(({ id }) => id !== person.id), { id: person.id, name: person.name }].sort(
                          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
                      )
                    : previous,
            );
            void client.invalidateQueries({
                queryKey: peopleKeys.list(ownerId),
            });
        },
    });

    const remove = useMutation({
        mutationFn: (id: string) => repository.remove(id),
        onSuccess: async (_, id) => {
            await Promise.all([
                client.cancelQueries({ queryKey: peopleKeys.list(ownerId) }),
                client.cancelQueries({
                    queryKey: peopleKeys.detail(ownerId, id),
                }),
            ]);
            client.removeQueries({
                queryKey: peopleKeys.detail(ownerId, id),
                exact: true,
            });
            client.setQueryData<PersonSummary[]>(peopleKeys.list(ownerId), (previous) =>
                previous?.filter((person) => person.id !== id),
            );
            void client.invalidateQueries({
                queryKey: peopleKeys.list(ownerId),
            });
        },
    });

    async function exclusive<T>(kind: Operation, action: () => Promise<T>): Promise<T> {
        if (locked.current) throw new Error("An operation is already in progress.");
        locked.current = true;
        setOperation(kind);
        try {
            return await action();
        } finally {
            locked.current = false;
            setOperation(null);
        }
    }

    function startNew() {
        if (locked.current && writing) return;
        setDraftId(crypto.randomUUID());
        navigate(null);
    }

    const unavailable = useCallback(() => {
        setDraftId(crypto.randomUUID());
        navigate(null, true);
    }, [navigate]);

    function afterSaved(person: SavedPerson) {
        if (activeEditor.current === editorKey) {
            // Reserve the next blank draft so browser Back to an absent selection
            // cannot reuse the editor that has just become a saved record.
            if (selectedId === null) setDraftId(crypto.randomUUID());
            navigate(person.id);
        }
    }
    function afterDeleted() {
        if (activeEditor.current === editorKey) startNew();
    }

    return (
        <div className="app-shell">
            <AppHeader />

            <main id="main-content">
                <CsvExport
                    repository={repository}
                    busy={operation !== null}
                    exporting={operation === "export"}
                    runExport={(action) => exclusive("export", action)}
                />

                <div className="workspace">
                    <PeopleList
                        ownerId={ownerId}
                        repository={repository}
                        selectedId={selectedId}
                        writing={writing}
                        onNew={startNew}
                        onSelect={navigate}
                    />

                    <section className="editor-panel" aria-label="Person editor" aria-busy={writing}>
                        <PersonEditor
                            key={editorKey}
                            ownerId={ownerId}
                            selectedId={selectedId}
                            draftId={draftId}
                            repository={repository}
                            operation={operation}
                            onSave={(id, input) => exclusive("save", () => save.mutateAsync({ id, input }))}
                            onDelete={(id) => exclusive("delete", () => remove.mutateAsync(id))}
                            onSaved={afterSaved}
                            onDeleted={afterDeleted}
                            onUnavailable={unavailable}
                        />
                    </section>
                </div>
            </main>
        </div>
    );
}
