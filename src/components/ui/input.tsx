import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type, ...props }: ComponentProps<"input">) {
    return (
        <input
            type={type}
            data-slot="input"
            className={cn(
                "flex h-11 w-full min-w-0 rounded-lg border border-input bg-white px-3.5 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-70 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15",
                className,
            )}
            {...props}
        />
    );
}
