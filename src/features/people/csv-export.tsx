import { ErrorNotice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { ArrowDownToLine, LoaderCircle } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { PeopleRepository } from "./repository";

type CsvExportProps = {
    repository: PeopleRepository;
    busy: boolean;
    exporting: boolean;
    runExport: (action: () => Promise<void>) => Promise<void>;
};

export function CsvExport({ repository, busy, exporting, runExport }: CsvExportProps) {
    const [exportFailed, setExportFailed] = useState(false);
    const mounted = useRef(false);
    useLayoutEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    async function exportPeople() {
        setExportFailed(false);
        try {
            await runExport(async () => {
                const records = await repository.exportAll();
                const { downloadPeople } = await import("./csv");
                if (!mounted.current) return;
                downloadPeople(records);
            });
        } catch {
            if (mounted.current) setExportFailed(true);
        }
    }

    return (
        <div className="page-intro">
            <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                    void exportPeople();
                }}
            >
                {exporting ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                    <ArrowDownToLine aria-hidden="true" />
                )}
                {exporting ? "Exporting…" : "Export CSV"}
            </Button>
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
        </div>
    );
}
