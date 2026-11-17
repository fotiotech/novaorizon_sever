import type {
  MenuLocation,
  MenuDisplayType,
  SubmenuDisplayType,
} from "../config/menu.constants.js";

export type MenuFeatureKey =
  | "description"
  | "mainImage"
  | "visible"
  | "order"
  | "sticky"
  | "background"
  | "columns"
  | "maxDepth"
  | "showImages"
  | "alignment"
  | "gap"
  | "theme"
  | "animation"
  | "showCaret"
  | "megaWidth"
  | "borderless"
  | "rounded"
  | "shadow";

export type ItemFeatureKey =
  | "submenuDisplay"
  | "panelAlignment"
  | "panelPosition"
  | "columns"
  | "featured"
  | "icon"
  | "badge";

export interface LocationCapabilities {
  displays: MenuDisplayType[];
  menuFeatures: Set<MenuFeatureKey>;
  itemFeatures: Set<ItemFeatureKey>;
  defaults: {
    display: MenuDisplayType;
    submenuDisplay: SubmenuDisplayType | null;
  };
  hint: string;
  warnings?: Partial<Record<MenuDisplayType, string>>;
}

const feats = (...k: MenuFeatureKey[]) => new Set(k);
const items = (...k: ItemFeatureKey[]) => new Set(k);

export const LOCATION_CAPABILITIES: Record<MenuLocation, LocationCapabilities> =
  {
    Banner: {
      displays: ["horizontal"],
      menuFeatures: feats(
        "description",
        "mainImage",
        "visible",
        "order",
        "sticky",
        "background",
        "alignment",
        "gap",
        "rounded",
        "shadow",
      ),
      itemFeatures: items("icon", "badge"),
      defaults: { display: "horizontal", submenuDisplay: null },
      hint: "A slim strip above the header. Best for promos and announcements — usually one line of links.",
    },
    NavBar: {
      displays: ["horizontal", "mega"],
      menuFeatures: feats(
        "description",
        "visible",
        "order",
        "maxDepth",
        "alignment",
        "gap",
        "theme",
        "animation",
        "showCaret",
        "megaWidth",
        "borderless",
        "rounded",
        "shadow",
      ),
      itemFeatures: items(
        "submenuDisplay",
        "panelAlignment",
        "panelPosition",
        "columns",
        "featured",
        "badge",
      ),
      defaults: { display: "horizontal", submenuDisplay: "dropdown" },
      hint: "The fixed header bar. Items render side-by-side; submenus open on hover or focus.",
    },
    SideBar: {
      displays: ["vertical"],
      menuFeatures: feats(
        "description",
        "visible",
        "order",
        "maxDepth",
        "showImages",
        "gap",
        "theme",
        "showCaret",
      ),
      itemFeatures: items("submenuDisplay", "icon", "badge"),
      defaults: { display: "vertical", submenuDisplay: "accordion" },
      hint: "The mobile drawer. Items stack vertically; children expand in place.",
    },
    Footer: {
      displays: ["grid", "horizontal", "vertical"],
      menuFeatures: feats(
        "description",
        "visible",
        "order",
        "background",
        "columns",
        "showImages",
        "alignment",
        "gap",
      ),
      itemFeatures: items(),
      defaults: { display: "grid", submenuDisplay: null },
      hint: "The site footer. Renders as flat columns of links — submenus aren't supported here.",
    },
    mobile: {
      displays: ["vertical", "grid"],
      menuFeatures: feats(
        "description",
        "visible",
        "order",
        "maxDepth",
        "showImages",
        "theme",
        "showCaret",
        "background",
        "columns",
      ),
      itemFeatures: items("submenuDisplay", "icon", "badge"),
      defaults: { display: "vertical", submenuDisplay: "accordion" },
      hint: "A mobile-only surface — typically a bottom tab bar or compact menu.",
    },
  };

const FALLBACK_CAPABILITIES: LocationCapabilities = {
  displays: ["horizontal", "vertical", "mega", "grid"],
  menuFeatures: feats(
    "description",
    "mainImage",
    "visible",
    "order",
    "sticky",
    "background",
    "columns",
    "maxDepth",
    "showImages",
    "alignment",
    "gap",
    "theme",
    "animation",
    "showCaret",
    "megaWidth",
    "borderless",
    "rounded",
    "shadow",
  ),
  itemFeatures: items(
    "submenuDisplay",
    "panelAlignment",
    "panelPosition",
    "columns",
    "featured",
    "icon",
    "badge",
  ),
  defaults: { display: "horizontal", submenuDisplay: "dropdown" },
  hint: "",
};

export function getCapabilities(location: string): LocationCapabilities {
  return (
    LOCATION_CAPABILITIES[location as MenuLocation] ?? FALLBACK_CAPABILITIES
  );
}

export function supportsMenuFeature(
  location: string,
  feature: MenuFeatureKey,
): boolean {
  return getCapabilities(location).menuFeatures.has(feature);
}
export function supportsItemFeature(
  location: string,
  feature: ItemFeatureKey,
): boolean {
  return getCapabilities(location).itemFeatures.has(feature);
}
export function availableDisplays(location: string): MenuDisplayType[] {
  return getCapabilities(location).displays;
}
export function locationHint(location: string): string {
  return getCapabilities(location).hint;
}
export function displayWarning(
  location: string,
  display: MenuDisplayType,
): string | null {
  return getCapabilities(location).warnings?.[display] ?? null;
}
export function snapDisplay(
  location: string,
  current: MenuDisplayType,
): MenuDisplayType {
  const allowed = getCapabilities(location).displays;
  return allowed.includes(current) ? current : allowed[0];
}
export function defaultSubmenuDisplay(
  location: string,
): SubmenuDisplayType | null {
  return getCapabilities(location).defaults.submenuDisplay;
}
