import "dotenv/config";
import { connection } from "../config/db.js";
import User from "../models/User.js";
import Customer from "../models/Customer.js";

await connection();

const users = await User.find({ role: "customer" })
  .select("name email")
  .lean();

let created = 0;
for (const user of users) {
  const exists = await Customer.exists({ userId: user._id });
  if (exists) continue;

  const parts = String(user.name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  try {
    await Customer.create({
      userId: user._id,
      billingAddress: {
        firstName: parts[0] ?? "Customer",
        lastName: parts.slice(1).join(" ") || "Customer",
        email: user.email,
      },
    });
    created += 1;
  } catch (error) {
    console.error("[customers] skipped", user.email, error);
  }
}

console.log(`[customers] created ${created} profile(s) for ${users.length} customer(s)`);
process.exit(0);
