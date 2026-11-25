import "dotenv/config";
import { connection } from "../config/db.js";
import Block from "../models/Block.js";

await connection();
const result = await Block.updateMany(
  { location: "ProductRelated" } as any,
  { $set: { location: "pdp" } },
);
console.log(`[blocks] migrated ${result.modifiedCount} placement(s) to pdp`);
process.exit(0);