import { twMerge } from "tailwind-merge";

export const cn = (...values: Array<string | false | null | undefined>) => twMerge(values);
