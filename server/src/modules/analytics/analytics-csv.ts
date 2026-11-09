const formulaPrefixes = ["=", "+", "-", "@", "\t", "\r"];

export const sanitizeCsvText = (value: string): string => {
  const flattened = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code > 31;
    })
    .join("");
  return formulaPrefixes.some((prefix) => flattened.startsWith(prefix))
    ? `'${flattened}`
    : flattened;
};

export type CsvCell = string | number | boolean | Date | null | undefined;

export const formatCsvCell = (value: CsvCell, options: { text?: boolean } = {}): string => {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "number") text = Number.isFinite(value) ? String(value) : "";
  else if (typeof value === "boolean") text = value ? "true" : "false";
  else text = options.text === false ? value : sanitizeCsvText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildCsv = (headers: string[], rows: CsvCell[][]): string =>
  `${[headers.map((header) => formatCsvCell(header)).join(","), ...rows.map((row) => row.map((cell) => formatCsvCell(cell)).join(","))].join("\r\n")}\r\n`;

export const sanitizeEndpoint = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "Invalid URL";
  }
};
