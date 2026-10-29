import { AlertCircle, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "./ui/button";

export function Loading({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {children}
        </div>
    );
}

export function ErrorNotice({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
    return (
        <div
            role="alert"
            className="rounded-xl border border-destructive/15 bg-destructive/4 p-4 text-sm text-destructive"
        >
            <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 leading-relaxed">{children}</div>
            </div>
            {onRetry && (
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                    <RotateCcw aria-hidden="true" />
                    Retry
                </Button>
            )}
        </div>
    );
}
