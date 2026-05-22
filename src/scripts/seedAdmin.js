import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";

dotenv.config();
await connectDB();

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD || "admin123";
const fullName = process.env.ADMIN_FULL_NAME || "System Admin";

const passwordHash = await bcrypt.hash(password, 10);
await User.findOneAndUpdate(
  { username },
  { username, passwordHash, fullName, role: "admin", status: "active" },
  { upsert: true, new: true }
);

console.log(`Admin ready: ${username}`);
process.exit(0);
