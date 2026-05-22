import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { changePassword, login, logout, me, updateProfile } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/login", asyncHandler(login));
router.get("/me", requireAuth, asyncHandler(me));
router.put("/profile", requireAuth, asyncHandler(updateProfile));
router.put("/password", requireAuth, asyncHandler(changePassword));
router.post("/logout", requireAuth, asyncHandler(logout));

export default router;
