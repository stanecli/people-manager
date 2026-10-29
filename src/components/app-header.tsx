import { UsersRound } from "lucide-react";

export function AppHeader() {
    return (
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
    );
}
