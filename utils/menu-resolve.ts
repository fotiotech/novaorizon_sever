export interface ResolvableItem {
  type: string;
  refId?: unknown;
  slug?: string | null;
  url?: string | null;
}

export function resolveHref(item: ResolvableItem): string {
  const id = item.refId ? String(item.refId) : "";
  const slug = item.slug ? String(item.slug) : "";

  const build = (prefix: string) => {
    if (!id) return "#";
    return slug ? `/${prefix}/${slug}/${id}` : `/${prefix}/${id}`;
  };

  switch (item.type) {
    case "category":
      return build("category");
    case "product":
      return build("products");
    case "collection":
      return build("collections");
    case "page":
    case "custom":
    default:
      return item.url || "#";
  }
}
