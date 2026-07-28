// ---------------------------------------------------------------------------
// LinkedIn Connections.csv parser
// ---------------------------------------------------------------------------
//
// The official "Get a copy of your data → Connections" export is an RFC 4180
// CSV, but with two quirks we handle here:
//
//   1. A "Notes:" preamble — a few human-readable lines (and a blank line)
//      before the real header row. We skip forward to the first row whose cells
//      look like the connection header ("First Name", "Last Name", …).
//   2. Quoted fields containing commas, quotes ("") and newlines — a position
//      like "Software Engineer, Platform" must stay one cell. The tokenizer
//      below is a full RFC 4180 reader (handles embedded newlines in quotes).

export interface ParsedConnection {
  name: string;
  firstName: string;
  lastName: string;
  company: string;
  position: string;
  url: string;
}

export interface ParseResult {
  connections: ParsedConnection[];
  total: number; // data rows seen (before dropping employer-less rows)
  skipped: number; // rows dropped for having no company
}

// Tokenize an entire CSV document into rows of string cells (RFC 4180).
function tokenize(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = input.replace(/^\uFEFF/, ""); // strip BOM

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // Consume \r\n as a single break; ignore blank line noise later.
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush the final field/row if the file didn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function norm(s: string | undefined): string {
  return (s ?? "").trim();
}

// Find the header row index by matching the known LinkedIn column labels,
// skipping the "Notes:" preamble. Returns -1 if no plausible header is found.
function findHeader(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = rows[i].map((c) => norm(c).toLowerCase());
    if (cells.includes("first name") && cells.includes("company")) return i;
  }
  return -1;
}

export function parseConnectionsCsv(input: string): ParseResult {
  const rows = tokenize(input).filter((r) => r.some((c) => norm(c) !== ""));
  const headerIdx = findHeader(rows);
  if (headerIdx === -1) {
    return { connections: [], total: 0, skipped: 0 };
  }

  const header = rows[headerIdx].map((c) => norm(c).toLowerCase());
  const col = (label: string) => header.indexOf(label);
  const iFirst = col("first name");
  const iLast = col("last name");
  const iCompany = col("company");
  const iPosition = col("position");
  const iUrl = col("url");

  const connections: ParsedConnection[] = [];
  let total = 0;
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const firstName = norm(r[iFirst]);
    const lastName = norm(r[iLast]);
    const company = norm(iCompany >= 0 ? r[iCompany] : "");
    const position = norm(iPosition >= 0 ? r[iPosition] : "");
    const url = norm(iUrl >= 0 ? r[iUrl] : "");

    // A row with neither a name nor a company is noise; skip silently.
    if (!firstName && !lastName && !company) continue;
    total++;

    if (!company) {
      skipped++;
      continue;
    }

    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    connections.push({ name, firstName, lastName, company, position, url });
  }

  return { connections, total, skipped };
}
