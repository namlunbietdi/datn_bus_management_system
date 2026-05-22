import ActivityLog from "../models/ActivityLog.js";

export async function logActivity({ user, action, module, targetId, metadata }) {
  try {
    await ActivityLog.create({
      user: user?._id || user || null,
      action,
      module,
      targetId,
      metadata: metadata || {}
    });
  } catch (error) {
    console.warn(`Activity log failed: ${error.message}`);
  }
}
