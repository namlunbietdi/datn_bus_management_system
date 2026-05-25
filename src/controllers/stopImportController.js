import Stop from "../models/Stop.js";
import { ok } from "../utils/apiResponse.js";
import { AppError } from "../utils/errors.js";
import { logActivity } from "../services/activityService.js";

const TEMPLATE_HEADERS = ["stopCode", "name", "lat", "lng", "address", "terminal"];
const TEMPLATE_ROWS = [
  ["BK01", "Bach Khoa", "21.005000", "105.843000", "So 1 Dai Co Viet", "false"],
  ["CG01", "Cau Giay", "21.036200", "105.790600", "Duong Cau Giay", "true"]
];

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(csv) {
  const text = String(csv || "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new AppError("CSV file is empty", 400);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const headers = parseCsvLine(lines.shift() || "").map((item) => item.trim());
  const missing = TEMPLATE_HEADERS.filter((header) => header !== "lng" && !headers.includes(header));
  if (!headers.includes("lng") && !headers.includes("lon")) missing.push("lng");
  if (missing.length) throw new AppError(`Missing CSV columns: ${missing.join(", ")}`, 400);

  return lines.map((line, index) => {
    const cells = parseCsvLine(line);
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? "";
    });
    return { lineNumber: index + 2, row };
  });
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (["true", "1", "yes", "y", "co", "có"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "khong", "không"].includes(normalized)) return false;
  return null;
}

function normalizeStop({ lineNumber, row }) {
  const errors = [];
  const stopCode = String(row.stopCode || "").trim();
  const name = String(row.name || "").trim();
  const lat = Number(row.lat);
  const lon = Number(row.lng || row.lon);
  const terminal = parseBoolean(row.terminal);

  if (!stopCode) errors.push("stopCode is required");
  if (!name) errors.push("name is required");
  if (!Number.isFinite(lat)) errors.push("lat must be a number");
  if (!Number.isFinite(lon)) errors.push("lng must be a number");
  if (terminal === null) errors.push("terminal must be true/false");

  return {
    lineNumber,
    errors,
    value: {
      stopCode,
      name,
      lat,
      lon,
      address: String(row.address || "").trim(),
      audio: stopCode,
      terminal: Boolean(terminal)
    }
  };
}

export async function exportStopTemplate(_req, res) {
  const csv = toCsv([TEMPLATE_HEADERS, ...TEMPLATE_ROWS]);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="stops_import_template.csv"');
  res.send(`\uFEFF${csv}\r\n`);
}

export async function importStopsCsv(req, res) {
  const csv = req.body?.csv;
  if (typeof csv !== "string") throw new AppError("csv field is required", 400);

  const parsed = parseCsv(csv).map(normalizeStop);
  const invalidRows = parsed
    .filter((item) => item.errors.length)
    .map((item) => ({ lineNumber: item.lineNumber, errors: item.errors }));
  if (invalidRows.length) {
    throw new AppError(`Invalid CSV rows: ${JSON.stringify(invalidRows)}`, 400);
  }

  const seen = new Set();
  const duplicates = [];
  for (const item of parsed) {
    if (seen.has(item.value.stopCode)) duplicates.push(item.value.stopCode);
    seen.add(item.value.stopCode);
  }
  if (duplicates.length) throw new AppError(`Duplicate stopCode in CSV: ${duplicates.join(", ")}`, 400);

  const existingCodes = new Set(
    (await Stop.find({ stopCode: { $in: parsed.map((item) => item.value.stopCode) } }).select("stopCode").lean())
      .map((item) => item.stopCode)
  );

  await Stop.bulkWrite(parsed.map((item) => ({
    updateOne: {
      filter: { stopCode: item.value.stopCode },
      update: { $set: item.value },
      upsert: true
    }
  })));

  const created = parsed.filter((item) => !existingCodes.has(item.value.stopCode)).length;
  const updated = parsed.length - created;

  await logActivity({
    user: req.user,
    action: "import_csv",
    module: "Stop",
    metadata: { total: parsed.length, created, updated }
  });

  ok(res, { total: parsed.length, created, updated });
}
