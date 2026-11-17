import mongoose, { Schema, Types, Model, HydratedDocument } from "mongoose";

export interface IAttributeGroup {
  code: string;
  name: string;
  parentId?: Types.ObjectId | null;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AttributeGroupModel = Model<IAttributeGroup>;
export type AttributeGroupDoc = HydratedDocument<IAttributeGroup>;

/** Walk the parent chain. Returns true if `targetParentId` would create a cycle. */
async function checkForCycle(
  model: AttributeGroupModel,
  currentId: Types.ObjectId | string,
  targetParentId: Types.ObjectId | string | null | undefined,
): Promise<boolean> {
  if (!targetParentId) return false;

  const visited = new Set<string>();
  let nextId = targetParentId.toString();

  while (nextId) {
    if (visited.has(nextId)) return true;
    visited.add(nextId);

    if (nextId === currentId.toString()) return true;

    const parent = await model.findById(nextId).select("parentId").lean();
    if (!parent) break;

    nextId = parent.parentId?.toString() || "";
  }
  return false;
}

const AttributeGroupSchema = new Schema<IAttributeGroup, AttributeGroupModel>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: "AttributeGroup",
      default: null,
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

AttributeGroupSchema.index({ parentId: 1, sortOrder: 1 });

// ── Cycle check on save
AttributeGroupSchema.pre("save", async function (
  this: AttributeGroupDoc,
  next: any,
) {
  if (!this.parentId) return next();
  try {
    const cycleDetected = await checkForCycle(
      this.constructor as AttributeGroupModel,
      this._id,
      this.parentId,
    );
    if (cycleDetected) {
      return next(new Error("Cycle detected in parent_id hierarchy."));
    }
    next();
  } catch (error) {
    next(error as Error);
  }
} as any);

AttributeGroupSchema.pre("findOneAndUpdate", async function (
  this: any,
  next: any,
) {
  const update = this.getUpdate() as mongoose.UpdateQuery<IAttributeGroup>;
  if (!update || (update.parentId === undefined && !update.$set?.parentId)) {
    return next();
  }
  const newParentId = update.$set?.parentId ?? update.parentId;
  if (!newParentId) return next();

  const docId = this.getQuery()._id;
  if (!docId) return next(new Error("Document _id missing in query."));

  try {
    const model = this.model as AttributeGroupModel;
    const cycleDetected = await checkForCycle(model, docId, newParentId);
    if (cycleDetected) {
      return next(new Error("Cycle detected in parent_id hierarchy."));
    }
    next();
  } catch (error) {
    next(error as Error);
  }
} as any);

const AttributeGroup: AttributeGroupModel =
  (mongoose.models.AttributeGroup as AttributeGroupModel | undefined) ??
  (mongoose.model(
    "AttributeGroup",
    AttributeGroupSchema as any,
  ) as unknown as AttributeGroupModel);

export default AttributeGroup;
