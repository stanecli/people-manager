import { ShieldCheck, UsersRound } from "lucide-react";

export function WelcomePanel({ children }: { children: React.ReactNode }) {
    return (
        <main className="welcome-shell">
            <div className="welcome-card">
                <div className="brand-mark mb-6">
                    <UsersRound className="size-5" aria-hidden="true" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight">People Manager</h1>
                <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">
                    A quiet place to keep your people organized.
                </p>
                {children}
                <div className="mt-8 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                    Your collection is private to your anonymous session.
                </div>
            </div>
        </main>
    );
}
