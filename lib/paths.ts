/** Prefix public asset URLs with the deploy base path (GitHub Pages subdir). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const asset = (p: string) => `${BASE_PATH}${p}`;
