export const slugMinLength = 3;
export const slugMaxLength = 48;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugify = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, slugMaxLength)
    .replace(/-+$/g, "");

export const validateSlug = (value: string): string | null => {
  if (value.length < slugMinLength) return `Use at least ${slugMinLength} characters.`;
  if (value.length > slugMaxLength) return `Use ${slugMaxLength} characters or fewer.`;
  if (!slugPattern.test(value)) {
    return "Use lowercase letters, numbers and single hyphens, without a leading or trailing hyphen.";
  }
  return null;
};

export const buildPublicUrl = (origin: string, slug: string): string =>
  `${origin.replace(/\/+$/, "")}/status/${slug || "your-slug"}`;

export const originOf = (publicUrl: string | undefined, fallback: string): string => {
  if (!publicUrl) return fallback;
  try {
    return new URL(publicUrl).origin;
  } catch {
    return fallback;
  }
};
