import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };

export const endpointFieldNames = ["webhookUrl", "url"];

export const toFormField = (key: string): string =>
  endpointFieldNames.includes(key) ? "endpoint" : key;

export const createMappedResolver =
  <T extends FieldValues>(validate: (values: T) => ValidationResult): Resolver<T> =>
  async (values) => {
    const result = validate(values);
    if (!("error" in result)) return { values, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const field = toFormField(String(issue.path[0] ?? "root"));
      if (!errors[field]) errors[field] = { type: "validation", message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<T> };
  };
