import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { AppError } from "../utils/errors.js";

export async function requireAuth(req, _res, next) {
  try {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;
    const token = req.cookies?.token || bearer;

    if (!token) {
      throw new AppError("Authentication required", 401);
    }

    if (!process.env.JWT_SECRET) {
      throw new AppError("JWT_SECRET is not configured", 500);
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("-passwordHash");
    if (!user || user.status !== "active") {
      throw new AppError("Invalid account", 401);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new AppError("Authentication required", 401));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError("Permission denied", 403));
      return;
    }
    next();
  };
}

export function canWrite(req, _res, next) {
  if (!req.user || !["admin", "dispatcher"].includes(req.user.role)) {
    next(new AppError("Permission denied", 403));
    return;
  }
  next();
}

export function adminOnly(req, _res, next) {
  if (!req.user || req.user.role !== "admin") {
    next(new AppError("Admin permission required", 403));
    return;
  }
  next();
}
