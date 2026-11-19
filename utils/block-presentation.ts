import {
  DEFAULT_BLOCK_DISPLAY_CONFIG,
  DEFAULT_BLOCK_SOURCE_STYLES,
  type BlockDisplay,
  type BlockSourceType,
} from "../config/content.constants.js";
import {
  COMMON_FIELDS,
  DISPLAY_FIELDS,
  FIELD_RULES,
  SOURCE_FIELDS,
} from "../config/block-presentation.js";

/**
 * Block presentation is stored per display type and per source type:
 *
 *   presentation.common  — styles every block has (theme, gap, …)
 *   presentation.display — fields the chosen `display` renders
 *   presentation.source  — fields the chosen `source.type` renders
 *
 * Writes go through `normalizePresentation`, which prunes anything the current
 * display/source cannot use. Reads go through `blockPresentation` (new shape,
 * with a legacy fallback for rows written before the change) and
 * `flattenPresentation` (the flat shape the storefront renderer consumes).
 */

export interface BlockPresentation {
  common: Record<string, any>;
  display: Record<string, any>;
  source: Record<string, any>;
}

/** Legacy flat key → canonical key. */
const SOURCE_ALIASES: Record<string, string> = {
  promotionBadgeStyle: "badgeStyle",
  promotionShowCode: "showCode",
  collectionShowItemCount: "showItemCount",
  collectionCountPosition: "countPosition",
  manualCardVariant: "cardVariant",
  manualShowDescription: "showDescription",
};

function coerce(key: string, value: unknown): unknown {
  const rule = FIELD_RULES[key];
  if (!rule) return undefined;

  switch (rule.kind) {
    case "enum": {
      const v = typeof value === "string" ? value : "";
      return (rule.values as readonly string[]).includes(v)
        ? v
        : rule.fallback;
    }
    case "number": {
      const n = Number(value);
      if (!Number.isFinite(n)) return rule.fallback;
      return Math.min(rule.max, Math.max(rule.min, Math.round(n)));
    }
    case "bool":
      return value === true || value === "true" || value === "on"
        ? true
        : value === false || value === "false"
          ? false
          : rule.fallback;
    case "color": {
      const s = typeof value === "string" ? value.trim() : "";
      return /^#([0-9a-f]{3,8})$/i.test(s) || s.startsWith("rgb") ? s : "";
    }
    default:
      return undefined;
  }
}

function pick(
  keys: readonly string[],
  sources: Array<Record<string, any> | undefined>,
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of keys) {
    const alias = Object.keys(SOURCE_ALIASES).find(
      (legacy) => SOURCE_ALIASES[legacy] === key,
    );
    let raw: unknown;
    for (const source of sources) {
      if (!source) continue;
      if (source[key] !== undefined) {
        raw = source[key];
        break;
      }
      if (alias && source[alias] !== undefined) {
        raw = source[alias];
        break;
      }
    }
    const value = coerce(key, raw);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Accepts the new nested shape ({ common, display, source }), the legacy flat
 * shape ({ displayConfig, sourceStyles }) or a flat object, and returns a
 * pruned presentation for the given display + source.
 */
export function normalizePresentation(
  input: any,
  display: BlockDisplay,
  sourceType: BlockSourceType,
): BlockPresentation {
  const src = input ?? {};
  const commonSource = src.common ?? {};
  const displaySource = src.display ?? src.displayConfig ?? src ?? {};
  const sourceSource = src.source ?? src.sourceStyles ?? src ?? {};

  return {
    common: pick(COMMON_FIELDS, [
      commonSource,
      src.displayConfig,
      src,
    ]),
    display: pick(DISPLAY_FIELDS[display] ?? [], [
      displaySource,
      src.displayConfig,
      src,
    ]),
    source: pick(SOURCE_FIELDS[sourceType] ?? [], [
      sourceSource,
      src.sourceStyles,
      src,
    ]),
  };
}

/** Reads the presentation from a block doc, with a legacy fallback. */
export function blockPresentation(block: any): BlockPresentation {
  const display: BlockDisplay = block?.display ?? "grid";
  const sourceType: BlockSourceType = block?.source?.type ?? "collection";

  if (block?.presentation) {
    return normalizePresentation(block.presentation, display, sourceType);
  }

  return normalizePresentation(
    {
      displayConfig: block?.displayConfig,
      sourceStyles: block?.sourceStyles,
    },
    display,
    sourceType,
  );
}

/**
 * Flat shape the renderer consumes. Kept flat deliberately: the storefront
 * components should not care where a value came from, only whether it applies.
 */
export function flattenPresentation(presentation: BlockPresentation): {
  displayConfig: typeof DEFAULT_BLOCK_DISPLAY_CONFIG;
  sourceStyles: typeof DEFAULT_BLOCK_SOURCE_STYLES;
} {
  const displayConfig: any = {
    ...DEFAULT_BLOCK_DISPLAY_CONFIG,
    ...presentation.common,
    ...presentation.display,
  };

  const sourceStyles: any = {
    ...DEFAULT_BLOCK_SOURCE_STYLES,
    // Card size is owned by the display now; mirror it for consumers that
    // still read the legacy `manualCardSize` key.
    manualCardSize: displayConfig.cardSize,
  };

  const source = presentation.source;
  if (source.cardVariant !== undefined)
    sourceStyles.manualCardVariant = source.cardVariant;
  if (source.showDescription !== undefined)
    sourceStyles.manualShowDescription = source.showDescription;
  if (source.showItemCount !== undefined)
    sourceStyles.collectionShowItemCount = source.showItemCount;
  if (source.countPosition !== undefined)
    sourceStyles.collectionCountPosition = source.countPosition;
  if (source.badgeStyle !== undefined)
    sourceStyles.promotionBadgeStyle = source.badgeStyle;
  if (source.showCode !== undefined)
    sourceStyles.promotionShowCode = source.showCode;

  return { displayConfig, sourceStyles };
}

/** Fields the admin editor should render for this display + source. */
export function presentationFieldKeys(
  display: BlockDisplay,
  sourceType: BlockSourceType,
): { common: readonly string[]; display: readonly string[]; source: readonly string[] } {
  return {
    common: COMMON_FIELDS,
    display: DISPLAY_FIELDS[display] ?? [],
    source: SOURCE_FIELDS[sourceType] ?? [],
  };
}
