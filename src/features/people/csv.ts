import Papa from "papaparse";
import type { SavedPerson } from "./model";

export function serializePeople(people: SavedPerson[]) {
    return Papa.unparse(
        {
            fields: ["Name", "Email", "Age"],
            data: people.map(({ name, email, age }) => [name, email, age]),
        },
        { header: true, newline: "\r\n", escapeFormulae: true },
    );
}

export function downloadPeople(people: SavedPerson[]) {
    const url = URL.createObjectURL(new Blob([serializePeople(people)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "people.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
