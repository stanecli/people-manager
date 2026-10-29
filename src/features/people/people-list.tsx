import { ErrorNotice, Loading } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, UsersRound } from "lucide-react";
import { peopleKeys } from "./query-keys";
import type { PeopleRepository } from "./repository";

type PeopleListProps = {
    ownerId: string;
    repository: PeopleRepository;
    selectedId: string | null;
    writing: boolean;
    onNew: () => void;
    onSelect: (id: string) => void;
};

export function PeopleList({ ownerId, repository, selectedId, writing, onNew, onSelect }: PeopleListProps) {
    const people = useQuery({
        queryKey: peopleKeys.list(ownerId),
        queryFn: ({ signal }) => repository.list(signal),
    });

    return (
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
                <Button type="button" className="w-full" disabled={writing} onClick={onNew}>
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
                                                    onSelect(person.id);
                                                }
                                            }}
                                        >
                                            <span className="min-w-0 flex-1 truncate">{person.name}</span>
                                            <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>
                )}
            </div>
        </aside>
    );
}
