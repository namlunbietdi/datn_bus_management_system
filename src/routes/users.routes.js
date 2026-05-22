import { Router } from "express";
import asyncHandler from "../utils/asyncHandler.js";
import { adminOnly, requireAuth } from "../middleware/auth.js";
import { createUser, deleteUser, getUser, listUsers, updateUser } from "../controllers/userController.js";

const router = Router();
router.use(requireAuth, adminOnly);
router.get("/", asyncHandler(listUsers));
router.post("/", asyncHandler(createUser));
router.get("/:id", asyncHandler(getUser));
router.put("/:id", asyncHandler(updateUser));
router.delete("/:id", asyncHandler(deleteUser));
export default router;
