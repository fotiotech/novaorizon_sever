import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";
import {
  MENU_LOCATIONS,
  MENU_DISPLAY_TYPES,
  SUBMENU_DISPLAY_TYPES,
  ALIGNMENTS,
  POSITIONS,
  ANIMATIONS,
  COLUMN_COUNTS,
  LINK_TYPES,
  REF_MODELS,
  REF_TYPES,
  MAX_DEPTH,
  REF_MODEL_BY_TYPE,
  type MenuLocation,
  type MenuDisplayType,
  type SubmenuDisplayType,
  type Alignment,
  type Position,
  type Animation,
  type LinkType,
  type RefModel,
} from "../config/menu.constants.js";

export const MENU_THEMES = ["light", "dark", "inherit"] as const;
export type MenuTheme = (typeof MENU_THEMES)[number];

export const MAX_FEATURED_SLOTS = 4;

export const SURFACE_LOCATIONS = ["Banner", "Footer", "mobile"] as const;
export type SurfaceLocation = (typeof SURFACE_LOCATIONS)[number];

export interface IMenuFeaturedSlot {
  image?: string;
  title?: string;
  href?: string;
  ctaText?: string;
  badge?: string;
}

export interface IMenuDisplayConfig {
  alignment: Alignment;
  gap: number;
  animation: Animation;
  showCaret: boolean;
  megaWidth: string;
  theme: MenuTheme;
  borderless: boolean;
  rounded: boolean;
  shadow: boolean;
}

export interface IMenuItem {
  _id: Types.ObjectId;
  label: string;
  type: LinkType;
  refId: Types.ObjectId | null;
  refModel: RefModel | null;
  url: string;
  icon: string | null;
  badge: string | null;
  openInNewTab: boolean;
  isVisible: boolean;
  order: number;
  submenuDisplay: SubmenuDisplayType | null;
  columns: number;
  submenuPosition: Position;
  align: Alignment;
  featured: IMenuFeaturedSlot | null;
  children: IMenuItem[];
}

export interface IMenu {
  name: string;
  description?: string;
  image?: string;
  items: IMenuItem[];
  location?: MenuLocation;
  order?: number;
  isSticky?: boolean;
  visible?: boolean;
  display: MenuDisplayType;
  columns?: number;
  maxDepth?: number;
  showImages?: boolean;
  displayConfig: IMenuDisplayConfig;
  backgroundColor?: string;
  backgroundImage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MenuModel = Model<IMenu>;
export type MenuDoc = HydratedDocument<IMenu>;

export const DEFAULT_DISPLAY_CONFIG: IMenuDisplayConfig = {
  alignment: "start",
  gap: 16,
  animation: "fade",
  showCaret: true,
  megaWidth: "960px",
  theme: "light",
  borderless: false,
  rounded: true,
  shadow: true,
};

export const FALLBACK_SUBMENU_DISPLAY: SubmenuDisplayType = "dropdown";

const DisplayConfigSchema = new Schema(
  {
    alignment: {
      type: String,
      enum: ALIGNMENTS,
      default: DEFAULT_DISPLAY_CONFIG.alignment,
    },
    gap: { type: Number, min: 0, max: 64, default: DEFAULT_DISPLAY_CONFIG.gap },
    animation: {
      type: String,
      enum: ANIMATIONS,
      default: DEFAULT_DISPLAY_CONFIG.animation,
    },
    showCaret: { type: Boolean, default: DEFAULT_DISPLAY_CONFIG.showCaret },
    megaWidth: {
      type: String,
      trim: true,
      default: DEFAULT_DISPLAY_CONFIG.megaWidth,
      validate: {
        validator: (v: string) =>
          !v || v === "container" || /^\d+(\.\d+)?(px|rem|em|vw|%)$/.test(v),
        message: "megaWidth must be a CSS length or 'container'",
      },
    },
    theme: {
      type: String,
      enum: MENU_THEMES,
      default: DEFAULT_DISPLAY_CONFIG.theme,
    },
    borderless: { type: Boolean, default: DEFAULT_DISPLAY_CONFIG.borderless },
    rounded: { type: Boolean, default: DEFAULT_DISPLAY_CONFIG.rounded },
    shadow: { type: Boolean, default: DEFAULT_DISPLAY_CONFIG.shadow },
  },
  { _id: false },
);

const FeaturedSlotSchema = new Schema(
  {
    image: { type: String, trim: true, default: null },
    title: { type: String, trim: true, maxlength: 80, default: null },
    href: { type: String, trim: true, default: null },
    ctaText: { type: String, trim: true, maxlength: 40, default: null },
    badge: { type: String, trim: true, maxlength: 20, default: null },
  },
  { _id: false },
);

const MenuItemSchema = new Schema<IMenuItem, any, any>(
  {
    label: {
      type: String,
      required: [true, "Item label is required"],
      trim: true,
      maxlength: 60,
    },
    type: { type: String, enum: LINK_TYPES, default: "custom" },
    refId: {
      type: Schema.Types.ObjectId,
      default: null,
      validate: {
        validator: function (this: any, v: Types.ObjectId | null): boolean {
          if ((REF_TYPES as readonly string[]).includes(this.type)) {
            return v != null;
          }
          return v == null;
        },
        message:
          "A reference is required for category/product/collection links",
      } as any,
    },
    refModel: {
      type: String,
      enum: [...REF_MODELS, null],
      default: null,
      validate: {
        validator: function (this: any, v: RefModel | null): boolean {
          if (!(REF_TYPES as readonly string[]).includes(this.type)) {
            return v == null;
          }
          return v === REF_MODEL_BY_TYPE[this.type];
        },
        message: "refModel does not match the link type",
      } as any,
    },
    url: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (this: any, v: string): boolean {
          if (this.type === "page" || this.type === "custom") {
            return !!v.trim();
          }
          return true;
        },
        message: "A URL is required for page and custom links",
      } as any,
    },
    icon: { type: String, trim: true, default: null },
    badge: { type: String, trim: true, maxlength: 20, default: null },
    openInNewTab: { type: Boolean, default: false },
    isVisible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    submenuDisplay: {
      type: String,
      enum: [...SUBMENU_DISPLAY_TYPES, null],
      default: null,
    },
    columns: { type: Number, enum: COLUMN_COUNTS, default: 3 },
    submenuPosition: { type: String, enum: POSITIONS, default: "bottom-start" },
    align: { type: String, enum: ALIGNMENTS, default: "start" },
    featured: { type: FeaturedSlotSchema, default: null },
  },
  { _id: true },
);

MenuItemSchema.add({ children: { type: [MenuItemSchema], default: [] } });

const MenuSchema = new Schema<IMenu, MenuModel>(
  {
    name: {
      type: String,
      required: [true, "Menu name is required"],
      trim: true,
      maxlength: [100, "Menu name cannot exceed 100 characters"],
    },
    description: { type: String, trim: true, maxlength: 500, default: null },
    image: { type: String, trim: true, default: null },

    items: { type: [MenuItemSchema], default: [] },

    location: { type: String, enum: MENU_LOCATIONS, default: null },
    order: { type: Number, default: 0, min: 0 },
    isSticky: { type: Boolean, default: false },
    visible: { type: Boolean, default: true },

    display: {
      type: String,
      enum: MENU_DISPLAY_TYPES,
      required: [true, "Display type is required"],
    },
    columns: { type: Number, enum: COLUMN_COUNTS, default: 4 },
    maxDepth: { type: Number, min: 1, max: MAX_DEPTH, default: 2 },
    showImages: { type: Boolean, default: false },
    displayConfig: {
      type: DisplayConfigSchema,
      default: () => ({ ...DEFAULT_DISPLAY_CONFIG }),
    },

    backgroundColor: {
      type: String,
      trim: true,
      default: "#ffffff",
      validate: {
        validator: function (this: any, v: string): boolean {
          if (!v || v === "#ffffff") return true;
          return (SURFACE_LOCATIONS as readonly string[]).includes(
            this.location ?? "",
          );
        },
        message:
          "backgroundColor only applies to Banner, Footer, and mobile menus",
      } as any,
    },
    backgroundImage: {
      type: String,
      trim: true,
      default: null,
      validate: {
        validator: function (this: any, v: string | null): boolean {
          if (!v) return true;
          return (SURFACE_LOCATIONS as readonly string[]).includes(
            this.location ?? "",
          );
        },
        message:
          "backgroundImage only applies to Banner, Footer, and mobile menus",
      } as any,
    },
  },
  { timestamps: true },
);

function treeDepth(items: unknown[]): number {
  if (!items?.length) return 0;
  return (
    1 +
    Math.max(...(items as IMenuItem[]).map((i) => treeDepth(i.children ?? [])))
  );
}

function normalizeOrder(items: IMenuItem[]) {
  items.forEach((item, i) => {
    item.order = i;
    if (item.children?.length) normalizeOrder(item.children);
  });
}

MenuSchema.pre("validate", function (this: any) {
  const depth = treeDepth(this.items ?? []);
  const cap = Math.min(this.maxDepth ?? MAX_DEPTH, MAX_DEPTH);
  if (depth > cap) {
    throw new Error(`Menu items exceed max depth of ${cap}`);
  }
});

MenuSchema.pre("save", function (this: any) {
  if (this.isModified("items")) normalizeOrder(this.items ?? []);
});

MenuSchema.index({ name: "text", description: "text" });
MenuSchema.index({ location: 1, visible: 1, order: 1 });

const Menu: MenuModel =
  (mongoose.models.Menu as MenuModel | undefined) ??
  (mongoose.model("Menu", MenuSchema) as unknown as MenuModel);

export { Menu };
export default Menu;
