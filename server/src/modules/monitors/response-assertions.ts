import type { Assertion, HttpConfig } from "./advanced.validation.js";
export type AssertionResult = { index: number; passed: boolean; message: string };
export const evaluateAssertions = (
  body: string,
  config?: Pick<HttpConfig, "keyword" | "assertions">,
): AssertionResult[] => {
  const results: AssertionResult[] = [];
  if (config?.keyword) {
    const { text, caseSensitive } = config.keyword;
    const passed = caseSensitive
      ? body.includes(text)
      : body.toLowerCase().includes(text.toLowerCase());
    results.push({
      index: -1,
      passed,
      message: passed ? "Text assertion passed." : "Response did not match the text assertion.",
    });
  }
  if (!config?.assertions.length) return results;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [
      ...results,
      ...config.assertions.map((_, index) => ({
        index,
        passed: false,
        message: "Response is not valid JSON.",
      })),
    ];
  }
  for (const [index, rule] of config.assertions.entries()) {
    let current: unknown = json;
    let exists = true;
    for (const part of rule.path.split(".")) {
      if (
        ["__proto__", "prototype", "constructor"].includes(part) ||
        current === null ||
        typeof current !== "object" ||
        !Object.hasOwn(current, part)
      ) {
        exists = false;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    const passed = exists && compare(current, rule);
    results.push({
      index,
      passed,
      message: passed
        ? "JSON assertion passed."
        : exists
          ? "JSON assertion did not match."
          : "JSON assertion path is missing.",
    });
  }
  return results;
};
const compare = (actual: unknown, rule: Assertion): boolean => {
  switch (rule.operator) {
    case "exists":
      return true;
    case "equals":
      return actual === rule.value;
    case "not_equals":
      return actual !== rule.value;
    case "contains":
      return (
        typeof actual === "string" && typeof rule.value === "string" && actual.includes(rule.value)
      );
    case "greater_than":
      return typeof actual === "number" && typeof rule.value === "number" && actual > rule.value;
    case "less_than":
      return typeof actual === "number" && typeof rule.value === "number" && actual < rule.value;
  }
};
