import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { logActivity } from "../services/activityService.js";

function sanitize(user) {
  const plain = user.toObject ? user.toObject() : user;
  delete plain.passwordHash;
  return plain;
}

export async function listUsers(req, res) {
  const search = String(req.query.search || "").trim();
  const filter = search
    ? { $or: [{ username: { $regex: search, $options: "i" } }, { fullName: { $regex: search, $options: "i" } }] }
    : {};
  if (req.query.status) filter.status = req.query.status;
  const items = await User.find(filter).select("-passwordHash").sort({ createdAt: -1 }).lean();
  ok(res, { items, total: items.length, page: 1, limit: items.length || 20 });
}

export async function getUser(req, res) {
  const user = await User.findById(req.params.id).select("-passwordHash").lean();
  if (!user) throw new AppError("User not found", 404);
  ok(res, user);
}

export async function createUser(req, res) {
  const { username, password, fullName, role, status } = req.body;
  if (!username || !password || !fullName) throw new AppError("username, password and fullName are required", 400);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, passwordHash, fullName, role, status });
  await logActivity({ user: req.user, action: "create", module: "User", targetId: user._id.toString() });
  ok(res, sanitize(user), 201);
}

export async function updateUser(req, res) {
  const payload = { ...req.body };
  delete payload.passwordHash;
  if (payload.password) {
    payload.passwordHash = await bcrypt.hash(payload.password, 10);
    delete payload.password;
  }
  const user = await User.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
  if (!user) throw new AppError("User not found", 404);
  await logActivity({ user: req.user, action: "update", module: "User", targetId: user._id.toString() });
  ok(res, sanitize(user));
}

export async function deleteUser(req, res) {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  await logActivity({ user: req.user, action: "delete", module: "User", targetId: user._id.toString() });
  ok(res, { id: req.params.id });
}
