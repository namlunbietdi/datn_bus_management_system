import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { logActivity } from "../services/activityService.js";

function parseQuery(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  return { page, limit, search, status };
}

export function createCrudController(Model, options = {}) {
  const moduleName = options.moduleName || Model.modelName;
  const searchable = options.searchable || [];
  const populate = options.populate || "";

  return {
    list: async (req, res) => {
      const { page, limit, search, status } = parseQuery(req);
      const filter = {};
      const customFilter = options.filterBuilder ? options.filterBuilder(req.query) : null;
      if (status && !customFilter?.skipStatus) filter.status = status;
      if (customFilter) {
        delete customFilter.skipStatus;
        Object.assign(filter, customFilter);
      }
      if (search && searchable.length) {
        filter.$or = searchable.map((field) => ({ [field]: { $regex: search, $options: "i" } }));
      }

      const query = Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
      if (populate) query.populate(populate);
      const [items, total] = await Promise.all([query.lean(), Model.countDocuments(filter)]);
      const finalItems = options.afterList ? await options.afterList(items, req) : items;
      ok(res, { items: finalItems, total, page, limit });
    },

    get: async (req, res) => {
      const query = Model.findById(req.params.id);
      if (populate) query.populate(populate);
      const item = await query.lean();
      if (!item) throw new AppError(`${moduleName} not found`, 404);
      ok(res, item);
    },

    create: async (req, res) => {
      const payload = options.beforeCreate ? await options.beforeCreate(req.body, req) : req.body;
      const item = await Model.create(payload);
      await logActivity({ user: req.user, action: "create", module: moduleName, targetId: item._id.toString() });
      ok(res, item, 201);
    },

    update: async (req, res) => {
      const payload = options.beforeUpdate ? await options.beforeUpdate(req.body, req) : req.body;
      const item = await Model.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true
      });
      if (!item) throw new AppError(`${moduleName} not found`, 404);
      await logActivity({ user: req.user, action: "update", module: moduleName, targetId: item._id.toString() });
      ok(res, item);
    },

    remove: async (req, res) => {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) throw new AppError(`${moduleName} not found`, 404);
      await logActivity({ user: req.user, action: "delete", module: moduleName, targetId: item._id.toString() });
      ok(res, { id: req.params.id });
    }
  };
}
