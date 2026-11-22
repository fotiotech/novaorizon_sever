import mongoose from "mongoose";
import { connection } from "./dist/config/db.js";
import { Event } from "./dist/models/Event.js";
await connection();
const latest = await Event.find({}).sort({ timestamp: -1 }).limit(5).select("eventType timestamp isBot userId").lean();
const count = await Event.countDocuments({});
const lastHour = await Event.countDocuments({ timestamp: { $gt: new Date(Date.now() - 3600_000) } });
console.log(JSON.stringify({ count, lastHour, latest }, null, 2));
await mongoose.disconnect();