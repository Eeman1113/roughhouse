import raw from "./catalog.json";

export interface CatalogItem {
  id: string;
  label: string;
  cat: string;
  w: number;
  h: number;
}

export const CATALOG = raw as CatalogItem[];

const byId = new Map(CATALOG.map((c) => [c.id, c]));

export function itemDef(kind: string): CatalogItem {
  return byId.get(kind) ?? { id: kind, label: kind, cat: "Other", w: 60, h: 60 };
}

export const CATEGORIES: string[] = [...new Set(CATALOG.map((c) => c.cat))];
