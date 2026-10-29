import { ErrorNotice, Loading } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ChevronRight, LoaderCircle, Plus, UsersRound } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PersonInput, PersonSummary, SavedPerson } from "./model";
import { PersonEditor } from "./person-editor";
import { peopleKeys } from "./query-keys";
import { createPeopleRepository } from "./repository";
import { usePersonSelection } from "./selection";

type Operation = "save" | "delete" | "export";

export function PeoplePage({ ownerId }: { ownerId: string }) {
    const repository = useMemo(() => createPeopleRepository(ownerId), [ownerId]);
    const client = useQueryClient();
    const [operation, setOperation] = useState<Operation | null>(null);
    const writing = operation === "save" || operation === "delete";
    const { selectedId, navigate } = usePersonSelection(writing);
    const [draftId, setDraftId] = useState(() => crypto.randomUUID());
    const [exportFailed, setExportFailed] = useState(false);
    const locked = useRef(false);
    const editorKey = selectedId ?? draftId;
    const activeEditor = useRef<string | null>(editorKey);
    useLayoutEffect(() => {
        activeEditor.current = editorKey;
        return () => {
            activeEditor.current = null;
        };
    }, [editorKey]);

    const people = useQuery({
        queryKey: peopleKeys.list(ownerId),
        queryFn: ({ signal }) => repository.list(signal),
    });

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

    async function exportPeople() {
        setExportFailed(false);
        try {
            await exclusive("export", async () => {
                const records = await repository.exportAll();
                const { downloadPeople } = await import("./csv");
                if (activeEditor.current === null) return;
                downloadPeople(records);
            });
        } catch {
            setExportFailed(true);
        }
    }

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
            <header className="app-header">
                <div className="flex min-w-0 items-center gap-3.5">
                    <div className="brand-mark">
                        <UsersRound className="size-5" strokeWidth={1.7} aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">People Manager</h1>
                    </div>
                </div>
            </header>

            <main id="main-content">
                <div className="page-intro">
                    <div>
                        <Button
                            variant="outline"
                            disabled={operation !== null}
                            onClick={() => {
                                void exportPeople();
                            }}
                        >
                            {operation === "export" ? (
                                <LoaderCircle className="animate-spin" aria-hidden="true" />
                            ) : (
                                <ArrowDownToLine aria-hidden="true" />
                            )}
                            {operation === "export" ? "Exporting…" : "Export CSV"}
                        </Button>
                    </div>
                </div>

                {exportFailed && (
                    <div className="mb-5">
                        <ErrorNotice
                            onRetry={() => {
                                void exportPeople();
                            }}
                        >
                            Could not export your people. No partial file was downloaded.
                        </ErrorNotice>
                    </div>
                )}

                <div className="workspace">
                    <aside className="people-panel" aria-labelledby="people-title">
                        <div className="border-b border-border p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 id="people-title" className="text-sm font-semibold">
                                    People
                                </h2>
                                {people.data && (
                                    <span className="min-w-6 rounded-md bg-secondary px-1.5 py-0.5 text-center text-xs text-muted-foreground">
                                        {people.data.length}
                                    </span>
                                )}
                            </div>
                            <Button type="button" className="w-full" disabled={writing} onClick={startNew}>
                                <Plus aria-hidden="true" />
                                New person
                            </Button>
                        </div>
                        <div className="people-list">
                            {people.isPending && (
                                <div className="p-5">
                                    <Loading>Loading people…</Loading>
                                </div>
                            )}
                            {people.isError && (
                                <div className="p-4">
                                    <ErrorNotice
                                        onRetry={() => {
                                            void people.refetch();
                                        }}
                                    >
                                        Could not load your people. Please try again.
                                    </ErrorNotice>
                                </div>
                            )}
                            {people.data?.length === 0 && (
                                <div className="list-empty">
                                    <div className="mb-4 flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-secondary/50 text-muted-foreground">
                                        <UsersRound className="size-5" strokeWidth={1.5} aria-hidden="true" />
                                    </div>
                                    <p className="text-sm font-medium text-foreground">Your list starts here</p>
                                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                                        No people yet. Add someone
                                        <br />
                                        using the form to get started.
                                    </p>
                                </div>
                            )}
                            {people.data && people.data.length > 0 && (
                                <nav aria-label="People">
                                    <ul className="space-y-1 p-2.5">
                                        {people.data.map((person) => {
                                            const url = new URL(window.location.href);
                                            url.searchParams.set("person", person.id);
                                            return (
                                                <li key={person.id}>
                                                    <a
                                                        href={`${url.pathname}${url.search}${url.hash}`}
                                                        aria-current={selectedId === person.id ? "true" : undefined}
                                                        aria-disabled={writing}
                                                        tabIndex={writing ? -1 : undefined}
                                                        className={cn(
                                                            "person-link",
                                                            selectedId === person.id && "person-link-selected",
                                                            writing && "cursor-wait opacity-60",
                                                        )}
                                                        onClick={(event) => {
                                                            if (writing) {
                                                                event.preventDefault();
                                                                return;
                                                            }
                                                            if (
                                                                !event.metaKey &&
                                                                !event.ctrlKey &&
                                                                !event.shiftKey &&
                                                                !event.altKey &&
                                                                event.button === 0
                                                            ) {
                                                                event.preventDefault();
                                                                navigate(person.id);
                                                            }
                                                        }}
                                                    >
                                                        <span className="min-w-0 flex-1 truncate">{person.name}</span>
                                                        <ChevronRight
                                                            className="size-3.5 shrink-0"
                                                            aria-hidden="true"
                                                        />
                                                    </a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </nav>
                            )}
                        </div>
                    </aside>

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
