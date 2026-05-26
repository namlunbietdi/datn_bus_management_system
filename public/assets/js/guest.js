const HANOI_CENTER = [21.0285, 105.8542];

const state = {
  map: null,
  stopLayer: null,
  vehicleLayer: null,
  stops: [],
  selectedStopCode: "",
  selectedVehicleId: "",
  refreshTimer: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || "Không tải được dữ liệu");
  }
  return result.data;
}

function setStatus(text) {
  const status = document.getElementById("guestStatus");
  if (status) status.textContent = text;
}

function addBaseMap(map) {
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);
}

function stopIcon(active = false) {
  return L.divIcon({
    className: `guest-stop-icon ${active ? "active" : ""}`,
    html: '<i class="bi bi-signpost-2-fill"></i>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16]
  });
}

function vehicleIcon(heading = 0) {
  const rotation = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  return L.divIcon({
    className: "guest-vehicle-icon",
    html: `<i class="bi bi-bus-front-fill" style="transform: rotate(${rotation}deg)"></i>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -18]
  });
}

function initMap() {
  state.map = L.map("guestMap", { zoomControl: false, preferCanvas: true }).setView(HANOI_CENTER, 12);
  addBaseMap(state.map);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);
  state.stopLayer = L.layerGroup().addTo(state.map);
  state.vehicleLayer = L.layerGroup().addTo(state.map);
}

function drawStops() {
  state.stopLayer.clearLayers();
  const points = [];

  for (const stop of state.stops) {
    const lat = Number(stop.lat);
    const lon = Number(stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const active = stop.stopCode === state.selectedStopCode;
    const marker = L.marker([lat, lon], { icon: stopIcon(active) }).addTo(state.stopLayer);
    marker.bindPopup(`
      <strong>${escapeHtml(stop.name)}</strong><br>
      <span>${escapeHtml(stop.stopCode)}</span>
    `);
    marker.on("click", () => selectStop(stop.stopCode));
    points.push([lat, lon]);
  }

  if (points.length) {
    state.map.fitBounds(L.latLngBounds(points).pad(0.16), { maxZoom: 15 });
  }
}

function openPanel() {
  document.getElementById("stopPanel").classList.add("open");
}

function closePanel() {
  document.getElementById("stopPanel").classList.remove("open");
  state.selectedVehicleId = "";
  state.vehicleLayer.clearLayers();
}

function formatUpdatedAt(value) {
  return value ? `Cập nhật ${new Date(value).toLocaleTimeString("vi-VN")}` : "Chưa cập nhật";
}

function renderStopHeader(stop, data) {
  document.getElementById("selectedStopCode").textContent = stop?.stopCode || "Điểm dừng";
  document.getElementById("selectedStopName").textContent = stop?.name || "Điểm dừng";
  document.getElementById("selectedStopAddress").textContent = stop?.address || "";
  document.getElementById("arrivalCount").textContent = `${data.arrivals.length} xe`;
  document.getElementById("arrivalUpdatedAt").textContent = formatUpdatedAt(data.updatedAt);
}

function arrivalSubtitle(arrival) {
  const routeName = arrival.routeName ? ` - ${arrival.routeName}` : "";
  const speed = Number.isFinite(Number(arrival.gps?.speed)) ? `${Math.round(Number(arrival.gps.speed))} km/h` : "";
  const seen = Number.isFinite(Number(arrival.lastSeenSecondsAgo)) ? `GPS ${arrival.lastSeenSecondsAgo}s trước` : "";
  return [arrival.directionLabel, speed, seen].filter(Boolean).join(" · ") + routeName;
}

function renderArrivals(arrivals) {
  const list = document.getElementById("arrivalList");
  if (!arrivals.length) {
    list.innerHTML = '<div class="guest-empty">Chưa có xe đang tiến tới điểm dừng này.</div>';
    return;
  }

  list.innerHTML = arrivals.map((arrival) => `
    <button class="guest-arrival-row ${arrival.id === state.selectedVehicleId ? "active" : ""}" type="button" data-arrival-id="${escapeHtml(arrival.id)}">
      <span class="guest-route-pill">${escapeHtml(arrival.routeCode)}</span>
      <span class="guest-arrival-main">
        <strong>${escapeHtml(arrival.vehiclePlate || "Xe đang chạy tuyến")}</strong>
        <small>${escapeHtml(arrivalSubtitle(arrival))}</small>
      </span>
      <span class="guest-eta">${escapeHtml(arrival.etaText)}</span>
    </button>
  `).join("");

  list.querySelectorAll("[data-arrival-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const arrival = arrivals.find((item) => item.id === button.dataset.arrivalId);
      if (arrival) selectVehicle(arrival);
    });
  });
}

function drawSelectedStop(stop) {
  drawStops();
  const lat = Number(stop.lat);
  const lon = Number(stop.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    state.map.setView([lat, lon], Math.max(state.map.getZoom(), 16), { animate: true });
  }
}

async function loadArrivals(stopCode, options = {}) {
  const data = await api(`/api/public/stops/${encodeURIComponent(stopCode)}/arrivals`);
  const stop = data.stop;
  renderStopHeader(stop, data);
  renderArrivals(data.arrivals || []);
  setStatus(formatUpdatedAt(data.updatedAt));
  if (!options.keepMap) drawSelectedStop(stop);
  return data;
}

async function selectStop(stopCode) {
  state.selectedStopCode = stopCode;
  state.selectedVehicleId = "";
  state.vehicleLayer.clearLayers();
  openPanel();
  document.getElementById("arrivalList").innerHTML = '<div class="guest-empty">Đang tải xe sắp đến...</div>';
  try {
    await loadArrivals(stopCode);
  } catch (error) {
    document.getElementById("arrivalList").innerHTML = `<div class="guest-empty">${escapeHtml(error.message)}</div>`;
    setStatus("Lỗi tải dữ liệu");
  }
}

function selectVehicle(arrival) {
  const lat = Number(arrival.gps?.lat);
  const lng = Number(arrival.gps?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  state.selectedVehicleId = arrival.id;
  state.vehicleLayer.clearLayers();
  const marker = L.marker([lat, lng], { icon: vehicleIcon(arrival.gps?.heading) }).addTo(state.vehicleLayer);
  marker.bindPopup(`
    <strong>${escapeHtml(arrival.vehiclePlate || "Xe đang chạy tuyến")}</strong><br>
    Tuyến ${escapeHtml(arrival.routeCode)} · ${escapeHtml(arrival.directionLabel)}<br>
    ${escapeHtml(arrival.etaText)}
  `);
  marker.openPopup();
  state.map.setView([lat, lng], Math.max(state.map.getZoom(), 16), { animate: true });
  document.querySelectorAll(".guest-arrival-row").forEach((row) => {
    row.classList.toggle("active", row.dataset.arrivalId === arrival.id);
  });
}

async function loadStops() {
  const data = await api("/api/public/stops");
  state.stops = data.items || [];
  drawStops();
  setStatus(`${state.stops.length} điểm dừng`);
}

function startAutoRefresh() {
  state.refreshTimer = setInterval(() => {
    if (!state.selectedStopCode) return;
    loadArrivals(state.selectedStopCode, { keepMap: true }).catch(() => {
      setStatus("Lỗi cập nhật");
    });
  }, 8000);
}

document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  document.getElementById("closePanelBtn").addEventListener("click", closePanel);
  try {
    await loadStops();
    startAutoRefresh();
  } catch (error) {
    setStatus("Lỗi tải điểm dừng");
    document.getElementById("arrivalList").innerHTML = `<div class="guest-empty">${escapeHtml(error.message)}</div>`;
  }
});
