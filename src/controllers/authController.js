import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { logActivity } from "../services/activityService.js";

function signToken(user) {
  if (!process.env.JWT_SECRET) throw new AppError("JWT_SECRET is not configured", 500);
  return jwt.sign(
    { sub: user._id.toString(), role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt
  };
}

export async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) throw new AppError("Username and password are required", 400);

  const user = await User.findOne({ username });
  if (!user || user.status !== "active") throw new AppError("Invalid username or password", 401);

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError("Invalid username or password", 401);

  user.lastLoginAt = new Date();
  await user.save();
  await logActivity({ user, action: "login", module: "Auth", targetId: user._id.toString() });

  res.cookie("token", signToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  });
  ok(res, publicUser(user));
}

export async function me(req, res) {
  ok(res, publicUser(req.user));
}

export async function updateProfile(req, res) {
  const { fullName } = req.body;
  if (!fullName || !fullName.trim()) throw new AppError("Full name is required", 400);
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { fullName: fullName.trim() },
    { new: true, runValidators: true }
  );
  await logActivity({ user, action: "update_profile", module: "Auth", targetId: user._id.toString() });
  ok(res, publicUser(user));
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new AppError("Current password and new password are required", 400);
  if (newPassword.length < 6) throw new AppError("New password must be at least 6 characters", 400);

  const user = await User.findById(req.user._id);
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new AppError("Current password is incorrect", 400);

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  await logActivity({ user, action: "change_password", module: "Auth", targetId: user._id.toString() });
  ok(res, { changed: true });
}

export async function logout(req, res) {
  await logActivity({ user: req.user, action: "logout", module: "Auth", targetId: req.user?._id?.toString() });
  res.clearCookie("token");
  ok(res, { loggedOut: true });
}
