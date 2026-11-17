import { readFile } from "node:fs/promises";

// Offline fixture for the custom sql-cli contract. A real command would receive
// the SQL (as an argument or stdin) and return the same five columns.
process.stdout.write(await readFile(new URL("./example_rows.csv", import.meta.url), "utf8"));
