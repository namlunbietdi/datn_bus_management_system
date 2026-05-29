const state = {
  user: null,
  route: location.hash.replace("#", "") || "dashboard",
  modal: null,
  accountModal: null,
  accountMode: null,
  editing: null,
  stopSorter: null,
  stopSorterModal: null,
  routeGeoJson: null,
  routeGeoJsonModal: null,
  map: null,
  markers: [],
  maps: {},
  mapLayers: {},
  monitoringFullscreen: false,
  monitoringTimer: null,
  monitoringSelectedKey: null,
  monitoringDrawnRouteKey: null,
  monitoringRouteCache: new Map(),
  monitoringMarkerByKey: new Map(),
  monitoringKeyHandler: null,
  monitoringFullscreenHandler: null
};

const modules = [
  { key: "dashboard", label: "Dashboard", icon: "bi-grid-1x2", roles: ["admin", "dispatcher", "viewer"] },
  { key: "dispatch", label: "Điều phối", icon: "bi-send", roles: ["admin", "dispatcher"] },
  { key: "monitoring", label: "Giám sát", icon: "bi-map", roles: ["admin", "dispatcher", "viewer"] },
  { key: "devices", label: "Thiết bị", icon: "bi-cpu", roles: ["admin", "dispatcher", "viewer"] },
  { key: "routes", label: "Tuyến", icon: "bi-signpost-split", roles: ["admin", "dispatcher", "viewer"] },
  { key: "stops", label: "Điểm dừng", icon: "bi-geo-alt", roles: ["admin", "dispatcher", "viewer"] },
  { key: "vehicles", label: "Phương tiện", icon: "bi-bus-front", roles: ["admin", "dispatcher", "viewer"] },
  { key: "vehicleTypes", label: "Loại xe", icon: "bi-tags", roles: ["admin", "dispatcher", "viewer"], hidden: true },
  { key: "users", label: "Người dùng", icon: "bi-people", roles: ["admin"] },
  { key: "employees", label: "Nhân sự", icon: "bi-person-badge", roles: ["admin", "dispatcher", "viewer"] },
  { key: "logs", label: "Log Activity", icon: "bi-clock-history", roles: ["admin"] }
];

const crud = {
  vehicles: {
    title: "Quản lý phương tiện",
    endpoint: "/api/vehicles",
    icon: "bi-bus-front",
    search: "Mã xe, biển số, tuyến",
    columns: [
      ["vehicleCode", "Mã xe"],
      ["plateNumber", "Biển số"],
      ["vehicleType.name", "Loại xe"],
      ["seatCount", "Số chỗ"],
      ["manufactureYear", "Năm SX"],
      ["currentRoute", "Tuyến"],
      ["status", "Trạng thái"]
    ],
    fields: [
      ["vehicleCode", "Mã xe", "text", true],
      ["plateNumber", "Biển số", "text", true],
      ["vehicleType", "Loại xe", "select", true, []],
      ["manufactureYear", "Năm sản xuất", "number"],
      ["currentRoute", "Tuyến đang phụ trách", "text"],
      ["status", "Trạng thái", "select", false, ["active", "maintenance", "inactive"]]
    ],
    prepareFields: loadVehicleTypeOptions,
    extraToolbar: '<a class="btn btn-outline-primary" href="#vehicleTypes"><i class="bi bi-tags"></i> Quản lý loại xe</a>'
  },
  vehicleTypes: {
    title: "Quản lý loại xe",
    endpoint: "/api/vehicle-types",
    icon: "bi-tags",
    search: "Tên loại xe, mô tả",
    columns: [
      ["name", "Tên loại xe"],
      ["seatCount", "Số chỗ"],
      ["description", "Mô tả"]
    ],
    fields: [
      ["name", "Tên loại xe", "text", true],
      ["seatCount", "Số chỗ", "number", true],
      ["description", "Mô tả", "text"]
    ],
    backLink: '<a class="btn btn-outline-secondary" href="#vehicles"><i class="bi bi-arrow-left"></i> Quay lại phương tiện</a>'
  },
  devices: {
    title: "Quản lý thiết bị giám sát hành trình",
    endpoint: "/api/devices",
    icon: "bi-cpu",
    search: "Mã thiết bị",
    columns: [
      ["deviceId", "Mã thiết bị"],
      ["activeVehicle.plateNumber", "Xe gắn"],
      ["installedAt", "Ngày lắp"],
      ["expiredAt", "Hạn sử dụng"],
      ["nextMaintenanceAt", "Bảo trì tiếp"],
      ["status", "Trạng thái"]
    ],
    fields: [
      ["deviceId", "Mã thiết bị", "text", true],
      ["installedAt", "Ngày lắp đặt", "date"],
      ["expiredAt", "Hạn sử dụng", "date"],
      ["nextMaintenanceAt", "Kỳ bảo trì tiếp theo", "date"],
      ["status", "Trạng thái", "select", false, ["online", "offline", "maintenance", "expired"]]
    ],
    filters: ["online", "offline", "expiring", "maintenance_due", "maintenance", "expired"]
  },
  stops: {
    title: "Quản lý điểm dừng",
    endpoint: "/api/stops",
    icon: "bi-geo-alt",
    search: "Mã, tên, địa chỉ",
    columns: [
      ["stopCode", "Mã điểm"],
      ["name", "Tên điểm dừng"],
      ["lat", "Lat"],
      ["lon", "Lon"],
      ["address", "Địa chỉ"],
      ["terminal", "Terminal"]
    ],
    fields: [
      ["stopCode", "Mã điểm dừng", "text", true, { readonly: true }],
      ["name", "Tên điểm dừng", "text", true],
      ["lat", "Latitude", "number", true, { step: "any" }],
      ["lon", "Longitude", "number", true, { step: "any" }],
      ["address", "Địa chỉ", "text"],
      ["terminal", "Terminal", "checkbox"]
    ],
    extraToolbar: '<button class="btn btn-outline-primary" type="button" id="exportStopsTemplate"><i class="bi bi-download"></i> CSV mau</button>',
    map: "stops",
    afterOpen: prepareStopModal,
    afterShown: initStopLocationPicker
  },
  employees: {
    title: "Quản lý nhân sự",
    endpoint: "/api/employees",
    icon: "bi-person-badge",
    search: "Mã, họ tên, điện thoại",
    columns: [
      ["employeeCode", "Mã NV"],
      ["fullName", "Họ tên"],
      ["phone", "Số điện thoại"],
      ["role", "Vai trò"],
      ["licenseNumber", "GPLX"],
      ["status", "Trạng thái"]
    ],
    fields: [
      ["employeeCode", "Mã nhân viên", "text", true],
      ["fullName", "Họ tên", "text", true],
      ["phone", "Số điện thoại", "text"],
      ["role", "Vai trò", "select", false, ["driver", "attendant", "dispatcher", "staff"]],
      ["licenseNumber", "Giấy phép lái xe", "text"],
      ["status", "Trạng thái", "select", false, ["active", "inactive", "leave"]]
    ]
  },
  users: {
    title: "Quản lý người dùng",
    endpoint: "/api/users",
    icon: "bi-people",
    search: "Username, họ tên",
    columns: [
      ["username", "Username"],
      ["fullName", "Họ tên"],
      ["role", "Vai trò"],
      ["status", "Trạng thái"],
      ["lastLoginAt", "Đăng nhập cuối"]
    ],
    fields: [
      ["username", "Username", "text", true],
      ["password", "Mật khẩu", "password"],
      ["fullName", "Họ tên", "text", true],
      ["role", "Vai trò", "select", false, ["admin", "dispatcher", "viewer"]],
      ["status", "Trạng thái", "select", false, ["active", "inactive"]]
    ]
  }
};

const root = document.getElementById("appRoot");
const HANOI_CENTER = [21.0285, 105.8542];

function canOpen(module) {
  return module.roles.includes(state.user?.role);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (response.status === 401) {
    location.href = "/";
    return null;
  }
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const result = await response.json();
    if (!result.success) throw new Error(result.message || "Request failed");
    return result.data;
  }
  if (!response.ok) throw new Error("Request failed");
  return response;
}

function valueOf(item, path) {
  const value = path.split(".").reduce((acc, key) => acc?.[key], item);
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}T/)) return new Date(value).toLocaleString("vi-VN");
  return value ?? "";
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("vi-VN") : "";
}

function formatFare(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount)} VND`;
}

function statusBadge(value) {
  const label = value || "n/a";
  const map = {
    online: "success",
    active: "success",
    running: "success",
    published: "success",
    offline: "secondary",
    inactive: "secondary",
    stopped: "secondary",
    maintenance: "warning",
    expired: "danger",
    failed: "danger",
    signal_lost: "danger",
    returned: "info"
  };
  return `<span class="badge text-bg-${map[label] || "primary"}">${label}</span>`;
}

function toast(message, variant = "success") {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = `toast align-items-center text-bg-${variant} border-0`;
  el.role = "alert";
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  host.appendChild(el);
  const instance = new bootstrap.Toast(el, { delay: 2800 });
  instance.show();
  el.addEventListener("hidden.bs.toast", () => el.remove());
}

function resetManagedMaps() {
  for (const map of Object.values(state.maps)) {
    try {
      map.remove();
    } catch {
      // Leaflet can keep stale DOM event refs after a SPA view is replaced.
    }
  }
  state.maps = {};
  state.mapLayers = {};
}

function removeLayerSafely(key) {
  const layer = state.mapLayers[key];
  if (!layer) return;
  try {
    layer.remove();
  } catch {
    const map = state.maps[key];
    if (map?.hasLayer?.(layer)) {
      try {
        map.removeLayer(layer);
      } catch {
        // Ignore stale Leaflet layer refs.
      }
    }
  }
  delete state.mapLayers[key];
}

function addBaseMap(map) {
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    subdomains: "abcd",
    attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);
}

function ensureMap(key, elementId, zoom = 12) {
  const element = document.getElementById(elementId);
  if (!element) return null;
  if (state.maps[key] && state.maps[key]._container === element) {
    setTimeout(() => state.maps[key].invalidateSize(), 80);
    return state.maps[key];
  }
  if (state.maps[key]) {
    try {
      state.maps[key].remove();
    } catch {
      // Ignore stale Leaflet map refs.
    }
    delete state.maps[key];
    delete state.mapLayers[key];
  }
  if (element._leaflet_id) delete element._leaflet_id;
  const map = L.map(element, {
    zoomControl: false,
    preferCanvas: true
  }).setView([21.0285, 105.8542], zoom);
  addBaseMap(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  state.maps[key] = map;
  setTimeout(() => map.invalidateSize(), 120);
  return map;
}

function validStops(stops) {
  return stops
    .map((stop, index) => ({ ...stop, lat: Number(stop.lat), lon: Number(stop.lon), order: index + 1 }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
}

function stopIcon(index, active = false) {
  return L.divIcon({
    className: `stop-map-icon ${active ? "active" : ""}`,
    html: `<span>${index}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function drawStopsMap(key, elementId, stops, options = {}) {
  const map = ensureMap(key, elementId, options.zoom || 12);
  if (!map) return;
  removeLayerSafely(key);
  const layer = L.layerGroup().addTo(map);
  state.mapLayers[key] = layer;

  const points = validStops(stops);
  if (!points.length) {
    map.setView([21.0285, 105.8542], 12);
    return;
  }

  if (options.polyline && points.length > 1) {
    L.polyline(points.map((stop) => [stop.lat, stop.lon]), {
      color: options.color || "#0d6efd",
      weight: 4,
      opacity: 0.75
    }).addTo(layer);
  }

  points.forEach((stop, index) => {
    const active = options.activeCode && options.activeCode === stop.stopCode;
    const markerOptions = options.numbered ? { icon: stopIcon(index + 1, active) } : {};
    const marker = L.marker([stop.lat, stop.lon], markerOptions).addTo(layer);
    marker.bindPopup(`<strong>${stop.stopCode}</strong><br>${stop.name || ""}<br>${stop.lat}, ${stop.lon}`);
    if (active) marker.openPopup();
  });

  const bounds = L.latLngBounds(points.map((stop) => [stop.lat, stop.lon]));
  map.fitBounds(bounds.pad(0.18), { maxZoom: options.maxZoom || 16 });
}

function readCoordinate(name) {
  const raw = document.querySelector(`#entityFields input[name="${name}"]`)?.value.trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function stopLocationInputs() {
  return {
    lat: document.querySelector('#entityFields input[name="lat"]'),
    lon: document.querySelector('#entityFields input[name="lon"]')
  };
}

function stopLocationFromForm() {
  const lat = readCoordinate("lat");
  const lon = readCoordinate("lon");
  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function setStopLocationInputs(lat, lon) {
  const inputs = stopLocationInputs();
  if (!inputs.lat || !inputs.lon) return;
  inputs.lat.value = Number(lat).toFixed(6);
  inputs.lon.value = Number(lon).toFixed(6);
}

function updateStopLocationMarker() {
  const map = state.maps.stopLocation;
  const location = stopLocationFromForm();
  removeLayerSafely("stopLocationMarker");
  if (!map || !location) return;
  const layer = L.layerGroup().addTo(map);
  state.mapLayers.stopLocationMarker = layer;
  L.marker([location.lat, location.lon]).addTo(layer);
  map.setView([location.lat, location.lon], Math.max(map.getZoom(), 15));
}

function addStopLocationPicker() {
  const fields = document.getElementById("entityFields");
  fields.insertAdjacentHTML("beforeend", `
    <div class="col-12">
      <label class="form-label">Chọn vị trí trên bản đồ</label>
      <div class="map-shell stop-location-map"><div id="stopLocationMap" class="h-100"></div></div>
      <div class="form-text">Click trên bản đồ để tự động điền Latitude và Longitude.</div>
    </div>
  `);
}

async function fillNextStopCode(item) {
  if (item?._id) return;
  const input = document.querySelector('#entityFields input[name="stopCode"]');
  if (!input || input.value) return;
  const data = await api("/api/stops/next-code");
  input.value = data.stopCode || "";
}

function prepareStopModal(item) {
  addStopLocationPicker();
  fillNextStopCode(item).catch((error) => toast(error.message, "danger"));
}

function initStopLocationPicker() {
  const map = ensureMap("stopLocation", "stopLocationMap", 13);
  if (!map) return;
  const current = stopLocationFromForm();
  if (current) {
    map.setView([current.lat, current.lon], 15);
  } else {
    map.setView(HANOI_CENTER, 13);
  }
  map.invalidateSize();
  updateStopLocationMarker();
  map.off("click");
  map.on("click", (event) => {
    setStopLocationInputs(event.latlng.lat, event.latlng.lng);
    updateStopLocationMarker();
  });
  const inputs = stopLocationInputs();
  const updateFromInput = () => updateStopLocationMarker();
  inputs.lat?.addEventListener("input", updateFromInput);
  inputs.lon?.addEventListener("input", updateFromInput);
}

function directionStops(routeDetail, direction) {
  const routeDirection = (routeDetail.directions || []).find((item) => item.direction === direction);
  return (routeDirection?.stops || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => item.stop || { stopCode: item.stopCode })
    .filter((stop) => stop.stopCode);
}

function drawRouteDirectionsMap(routeDetail) {
  const map = ensureMap("route", "routeMap", 12);
  if (!map) return;
  removeLayerSafely("route");
  const layer = L.layerGroup().addTo(map);
  state.mapLayers.route = layer;

  const layers = [
    { direction: "outbound", geoJson: routeDetail.outboundGeoJson || routeDetail.geoJson, color: "#1a73e8" },
    { direction: "inbound", geoJson: routeDetail.inboundGeoJson, color: "#34a853" }
  ].filter((item) => item.geoJson);

  if (!layers.length) {
    map.setView([21.0285, 105.8542], 12);
    return;
  }

  const boundsList = [];
  layers.forEach((item) => {
    const geoJsonLayer = L.geoJSON(item.geoJson, {
      style: { color: item.color, weight: 5, opacity: 0.82 },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 6,
        color: item.color,
        fillColor: item.color,
        fillOpacity: 0.85
      }),
      onEachFeature: (feature, featureLayer) => {
        featureLayer.bindPopup(`${routeDetail.routeCode} ${item.direction}`);
      }
    }).addTo(layer);
    const bounds = geoJsonLayer.getBounds?.();
    if (bounds?.isValid?.()) boundsList.push(bounds);
  });
  if (boundsList.length) {
    const merged = boundsList.reduce((acc, bounds) => acc.extend(bounds), boundsList[0]);
    map.fitBounds(merged.pad(0.14), { maxZoom: 16 });
  } else {
    map.setView([21.0285, 105.8542], 12);
  }
}

function drawGeoJsonPreview(geoJson) {
  const map = ensureMap("routeGeoJsonPreview", "routeGeoJsonPreviewMap", 12);
  if (!map) return;
  removeLayerSafely("routeGeoJsonPreview");
  const layer = L.layerGroup().addTo(map);
  state.mapLayers.routeGeoJsonPreview = layer;
  if (!geoJson) {
    map.setView([21.0285, 105.8542], 12);
    return;
  }
  const geoJsonLayer = L.geoJSON(geoJson, {
    style: { color: "#1a73e8", weight: 5, opacity: 0.82 },
    pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
      radius: 6,
      color: "#1a73e8",
      fillColor: "#1a73e8",
      fillOpacity: 0.85
    })
  }).addTo(layer);
  const bounds = geoJsonLayer.getBounds?.();
  if (bounds?.isValid?.()) map.fitBounds(bounds.pad(0.14), { maxZoom: 16 });
}

function drawRouteGeoJsonPreview(routeDetail) {
  const map = ensureMap("routeGeoJsonPreview", "routeGeoJsonPreviewMap", 12);
  if (!map) return;
  removeLayerSafely("routeGeoJsonPreview");
  const layer = L.layerGroup().addTo(map);
  state.mapLayers.routeGeoJsonPreview = layer;
  const layers = [
    { direction: "outbound", geoJson: routeDetail.outboundGeoJson || routeDetail.geoJson, color: "#1a73e8" },
    { direction: "inbound", geoJson: routeDetail.inboundGeoJson, color: "#34a853" }
  ].filter((item) => item.geoJson);
  if (!layers.length) {
    map.setView([21.0285, 105.8542], 12);
    return;
  }
  const boundsList = [];
  layers.forEach((item) => {
    const geoJsonLayer = L.geoJSON(item.geoJson, {
      style: { color: item.color, weight: 5, opacity: 0.82 },
      pointToLayer: (_feature, latlng) => L.circleMarker(latlng, {
        radius: 6,
        color: item.color,
        fillColor: item.color,
        fillOpacity: 0.85
      })
    }).addTo(layer);
    const bounds = geoJsonLayer.getBounds?.();
    if (bounds?.isValid?.()) boundsList.push(bounds);
  });
  if (boundsList.length) {
    map.fitBounds(boundsList.reduce((acc, bounds) => acc.extend(bounds), boundsList[0]).pad(0.14), { maxZoom: 16 });
  }
}

function pageTitle(title, subtitle = "") {
  return `<div class="page-title"><h1>${title}</h1>${subtitle ? `<div class="text-secondary mt-1">${subtitle}</div>` : ""}</div>`;
}

function renderNav() {
  const nav = document.getElementById("mainNav");
  nav.innerHTML = modules
    .filter((item) => !item.hidden && canOpen(item))
    .map((item) => `<a class="btn ${state.route === item.key ? "btn-primary" : "btn-outline-primary"}" href="#${item.key}"><i class="bi ${item.icon}"></i> ${item.label}</a>`)
    .join("");
}

function dashboardModules() {
  const descriptions = {
    dispatch: "Tạo lệnh điều phối, override tuyến, khóa hoặc mở chuyến.",
    monitoring: "Theo dõi vị trí, tốc độ, tuyến và trạng thái kết nối.",
    devices: "Quản lý GPS, IMEI, bảo trì, hạn sử dụng và trạng thái online.",
    routes: "Quản lý tuyến, chiều đi/về, version và export JSON cho SD Card.",
    stops: "Quản lý điểm dừng, tọa độ, mã âm thanh và terminal.",
    vehicles: "Quản lý xe buýt, biển số, loại xe và tuyến phụ trách.",
    users: "Quản lý tài khoản, vai trò và trạng thái truy cập.",
    employees: "Quản lý tài xế, nhân viên phục vụ và giấy phép lái xe.",
    logs: "Theo dõi đăng nhập, thao tác dữ liệu, export và MQTT command."
  };
  return modules
    .filter((item) => item.key !== "dashboard" && !item.hidden && canOpen(item))
    .map((item) => `
      <div class="col-12 col-md-6 col-xl-4 col-xxl-3">
        <a class="module-card" href="#${item.key}">
          <span class="module-icon"><i class="bi ${item.icon}"></i></span>
          <h3>${item.label}</h3>
          <p>${descriptions[item.key]}</p>
        </a>
      </div>
    `)
    .join("");
}

async function renderDashboard() {
  root.innerHTML = `${pageTitle("HỆ THỐNG QUẢN LÝ XE BUÝT THÔNG MINH TẠI HÀ NỘI")}
    <div class="row g-3 mb-4" id="statCards">
      ${Array.from({ length: 7 }).map(() => '<div class="col-12 col-md-6 col-xl-4 col-xxl-3"><div class="stat-card"><span class="spinner-border spinner-border-sm"></span></div></div>').join("")}
    </div>
    <div class="row g-3">${dashboardModules()}</div>`;
  try {
    const data = await api("/api/dashboard/summary");
    const stats = [
      ["Tổng số xe", data.totalVehicles, "bi-bus-front"],
      ["Xe đang online", data.onlineVehicles, "bi-wifi"],
      ["Xe offline", data.offlineVehicles, "bi-wifi-off"],
      ["Số tuyến", data.totalRoutes, "bi-signpost-split"],
      ["Số thiết bị", data.totalDevices, "bi-cpu"],
      ["Cảnh báo thiết bị", data.warningDevices, "bi-exclamation-triangle"],
      ["Lệnh hôm nay", data.dispatchToday, "bi-send"]
    ];
    document.getElementById("statCards").innerHTML = stats.map(([label, value, icon]) => `
      <div class="col-12 col-md-6 col-xl-4 col-xxl-3">
        <div class="stat-card">
          <div class="d-flex justify-content-between align-items-start">
            <div><div class="value">${value ?? 0}</div><div class="label">${label}</div></div>
            <span class="module-icon m-0"><i class="bi ${icon}"></i></span>
          </div>
        </div>
      </div>
    `).join("");
  } catch (error) {
    toast(error.message, "danger");
  }
}

function modalField(field, item = {}) {
  const [name, label, type, required, options] = field;
  const value = item[name] && typeof item[name] === "object" ? item[name]._id : item[name];
  const attrs = [
    type === "number" && options?.step ? `step="${options.step}"` : "",
    options?.readonly ? "readonly" : ""
  ].filter(Boolean).join(" ");
  const inputAttrs = attrs ? ` ${attrs}` : "";
  if (type === "select") {
    return `<div class="col-12 col-md-6"><label class="form-label">${label}</label><select class="form-select" name="${name}" ${required ? "required" : ""}>
      <option value="">Chọn</option>${options.map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        const seatCount = typeof option === "object" ? option.seatCount : "";
        return `<option value="${optionValue}" data-seat-count="${seatCount}" ${String(value || "") === String(optionValue) ? "selected" : ""}>${optionLabel}</option>`;
      }).join("")}
    </select></div>`;
  }
  if (type === "checkbox") {
    return `<div class="col-12 col-md-6 d-flex align-items-end"><div class="form-check form-switch mb-2">
      <input class="form-check-input" type="checkbox" name="${name}" ${value ? "checked" : ""}>
      <label class="form-check-label">${label}</label>
    </div></div>`;
  }
  const formatted = type === "date" && value ? String(value).slice(0, 10) : value ?? "";
  return `<div class="col-12 col-md-6"><label class="form-label">${label}</label><input class="form-control" name="${name}" type="${type}" value="${formatted}"${inputAttrs} ${required ? "required" : ""}></div>`;
}

async function openEntityModal(config, item = null) {
  if (config.prepareFields) await config.prepareFields(config);
  state.editing = { config, item };
  document.getElementById("entityModalTitle").textContent = item ? `Sửa ${config.title}` : `Thêm mới ${config.title}`;
  document.getElementById("entityFields").innerHTML = config.fields.map((field) => modalField(field, item || {})).join("");
  if (config.afterOpen) config.afterOpen(item || {});
  if (config.afterShown) {
    document.getElementById("entityModal").addEventListener("shown.bs.modal", () => config.afterShown(item || {}), { once: true });
  }
  state.modal.show();
}

function formPayload(form) {
  const payload = {};
  for (const element of form.elements) {
    if (!element.name || element.disabled) continue;
    if (element.type === "checkbox") payload[element.name] = element.checked;
    else if (element.type === "number") payload[element.name] = element.value === "" ? undefined : Number(element.value);
    else if (element.value !== "") payload[element.name] = element.value;
  }
  return payload;
}

function parseGeoJsonText(direction = "") {
  const specific = direction ? document.getElementById(`routeGeoJsonText${direction === "outbound" ? "Outbound" : "Inbound"}`) : null;
  const fallback = document.getElementById("routeGeoJsonText");
  const raw = (specific || fallback)?.value.trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function routeGeoJsonByDirection(routeDetail, direction) {
  if (direction === "outbound") {
    return {
      geoJson: routeDetail.outboundGeoJson || routeDetail.geoJson,
      name: routeDetail.outboundGeoJsonName || routeDetail.geoJsonName,
      updatedAt: routeDetail.outboundGeoJsonUpdatedAt || routeDetail.geoJsonUpdatedAt
    };
  }
  return {
    geoJson: routeDetail.inboundGeoJson,
    name: routeDetail.inboundGeoJsonName,
    updatedAt: routeDetail.inboundGeoJsonUpdatedAt
  };
}

function monitoringKey(row) {
  return String(row?.dispatchOrderId || row?.deviceId || "");
}

function monitoringDirection(row) {
  const direction = row?.runtime?.direction || row?.planned?.direction;
  if (direction === "BACKWARD" || direction === "inbound") return "inbound";
  if (direction === "FORWARD" || direction === "outbound") return "outbound";
  return "";
}

function monitoringLatLng(row) {
  const lat = Number(row?.gps?.lat);
  const lng = Number(row?.gps?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monitoringMarkerPopup(row) {
  const label = escapeHtml(row.vehiclePlate || row.deviceId);
  const route = escapeHtml(`${row.runtime?.routeId || ""} ${row.runtime?.direction || ""}`.trim());
  const speed = row.gps?.status === "lost"
    ? "Vi tri GPS cuoi cung"
    : `${escapeHtml(row.gps?.speed || 0)} km/h`;
  return `<strong>${label}</strong><br>${route}<br>${speed}`;
}

function monitoringBusIcon(row) {
  const heading = Number(row.gps?.heading || 0);
  const statusClass = row.gps?.status === "lost" || row.status === "signal_lost" ? "lost" : "active";
  const transform = Number.isFinite(heading) ? ` style="transform: rotate(${heading}deg)"` : "";
  return L.divIcon({
    className: "",
    html: `<div class="monitoring-bus-icon ${statusClass}"${transform}><i class="bi bi-bus-front-fill"></i></div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -22]
  });
}

function cancelMonitoringMarkerAnimation(marker) {
  if (marker?._monitoringAnimationFrame) {
    cancelAnimationFrame(marker._monitoringAnimationFrame);
    marker._monitoringAnimationFrame = null;
  }
}

function animateMonitoringMarker(marker, targetPoint, duration = 2600) {
  const target = L.latLng(targetPoint[0], targetPoint[1]);
  const start = marker.getLatLng();
  if (!start || start.equals(target)) {
    marker.setLatLng(target);
    return;
  }

  cancelMonitoringMarkerAnimation(marker);
  const startedAt = performance.now();
  const startLat = start.lat;
  const startLng = start.lng;
  const deltaLat = target.lat - startLat;
  const deltaLng = target.lng - startLng;

  const tick = (now) => {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - ((-2 * progress + 2) ** 2) / 2;
    marker.setLatLng([startLat + deltaLat * eased, startLng + deltaLng * eased]);
    if (progress < 1) {
      marker._monitoringAnimationFrame = requestAnimationFrame(tick);
    } else {
      marker._monitoringAnimationFrame = null;
      marker.setLatLng(target);
    }
  };

  marker._monitoringAnimationFrame = requestAnimationFrame(tick);
}

function updateMonitoringVehicleMarkers(rows) {
  const seenKeys = new Set();

  for (const row of rows) {
    const key = monitoringKey(row);
    const point = monitoringLatLng(row);
    if (!key || !point) continue;
    seenKeys.add(key);

    let marker = state.monitoringMarkerByKey.get(key);
    if (!marker) {
      marker = L.marker(point, { icon: monitoringBusIcon(row) }).addTo(state.map);
      marker.monitoringKey = key;
      state.monitoringMarkerByKey.set(key, marker);
    } else {
      marker.setIcon(monitoringBusIcon(row));
      animateMonitoringMarker(marker, point);
    }

    const popup = monitoringMarkerPopup(row);
    if (marker.getPopup()) {
      marker.setPopupContent(popup);
    } else {
      marker.bindPopup(popup);
    }
  }

  for (const [key, marker] of state.monitoringMarkerByKey.entries()) {
    if (seenKeys.has(key)) continue;
    cancelMonitoringMarkerAnimation(marker);
    marker.remove();
    state.monitoringMarkerByKey.delete(key);
  }

  state.markers = [...state.monitoringMarkerByKey.values()];
}

function clearMonitoringVehicleMarkers() {
  for (const marker of state.monitoringMarkerByKey.values()) {
    cancelMonitoringMarkerAnimation(marker);
    marker.remove();
  }
  state.monitoringMarkerByKey.clear();
  state.markers = [];
}

function monitoringStopText(stopDetail, runtimeIndex) {
  if (stopDetail?.name || stopDetail?.stopCode) {
    const title = stopDetail.name || "Điểm dừng";
    const code = stopDetail.stopCode ? ` (${stopDetail.stopCode})` : "";
    const order = Number.isFinite(Number(stopDetail.order)) ? ` · thứ tự ${stopDetail.order}` : "";
    return escapeHtml(`${title}${code}${order}`);
  }
  return Number.isInteger(runtimeIndex) ? `Stop ${runtimeIndex}` : "-";
}

function monitoringNextStopLine(row) {
  const nextStop = row.runtime?.nextStop;
  const nextStopDetail = row.runtime?.nextStopDetail;
  if (!Number.isInteger(nextStop) && !nextStopDetail) return "";
  return `<div class="small">Điểm dừng tiếp theo: ${monitoringStopText(nextStopDetail, nextStop)}</div>`;
}

function monitoringActiveStop(row, stop, index) {
  const nextStop = Number(row?.runtime?.nextStop);
  const currentStop = Number(row?.runtime?.currentStop);
  const order = Number(stop?.order || index + 1);
  return Number.isInteger(nextStop) && (nextStop === order || (nextStop === 0 && index === 0))
    || Number.isInteger(currentStop) && (currentStop === order || (currentStop === 0 && index === 0));
}

function fitMonitoringSelection(routeLayer, row) {
  const vehiclePoint = monitoringLatLng(row);
  const routeBounds = routeLayer?.getBounds?.();
  if (routeBounds?.isValid?.()) {
    const bounds = L.latLngBounds(routeBounds.getSouthWest(), routeBounds.getNorthEast());
    if (vehiclePoint) bounds.extend(vehiclePoint);
    state.map.fitBounds(bounds.pad(0.18), { maxZoom: 16 });
    return;
  }
  if (vehiclePoint) state.map.setView(vehiclePoint, 16);
}

async function drawMonitoringRoute(row, options = {}) {
  if (!state.map || !row) return;
  const routeCode = row.runtime?.routeId || row.planned?.routeId;
  const direction = monitoringDirection(row);
  const hint = document.getElementById("monitoringRouteHint");
  if (!routeCode || !direction) {
    removeLayerSafely("monitoringRoute");
    state.monitoringDrawnRouteKey = null;
    if (hint) hint.textContent = "Chọn xe để hiển thị tuyến";
    return;
  }

  const cacheKey = `${routeCode}:${direction}`;
  if (state.monitoringDrawnRouteKey === cacheKey && state.mapLayers.monitoringRoute) {
    if (hint) hint.textContent = `${routeCode} - ${direction}`;
    if (options.fit) fitMonitoringSelection(state.mapLayers.monitoringRoute, row);
    return;
  }

  let routeData = state.monitoringRouteCache.get(cacheKey);
  if (!routeData) {
    try {
      routeData = await api(`/api/routes/code/${encodeURIComponent(routeCode)}/geojson?direction=${direction}`);
      state.monitoringRouteCache.set(cacheKey, routeData);
    } catch (error) {
      removeLayerSafely("monitoringRoute");
      state.monitoringDrawnRouteKey = null;
      if (hint) hint.textContent = `${routeCode} ${direction === "inbound" ? "chiều về" : "chiều đi"} chưa có GeoJSON`;
      return;
    }
  }

  removeLayerSafely("monitoringRoute");
  const layer = L.featureGroup().addTo(state.map);
  L.geoJSON(routeData.geoJson, {
    style: {
      color: direction === "inbound" ? "#188038" : "#0d6efd",
      weight: 6,
      opacity: 0.88
    }
  }).addTo(layer);
  (routeData.stops || []).forEach((stop, index) => {
    const lat = Number(stop.lat);
    const lon = Number(stop.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const active = monitoringActiveStop(row, stop, index);
    const marker = L.marker([lat, lon], { icon: stopIcon(index + 1, active) }).addTo(layer);
    marker.bindPopup(`<strong>${stop.stopCode || ""}</strong><br>${stop.name || ""}<br>${direction === "inbound" ? "Chieu ve" : "Chieu di"} - Stop ${index + 1}`);
  });
  state.mapLayers.monitoringRoute = layer;
  state.monitoringDrawnRouteKey = cacheKey;
  if (hint) hint.textContent = `${routeCode} · ${direction === "inbound" ? "chiều về" : "chiều đi"}`;
  if (options.fit) fitMonitoringSelection(layer, row);
}

async function openRouteGeoJsonModal(routeRow) {
  const routeDetail = await api(`/api/routes/${routeRow._id}`);
  state.routeGeoJson = routeDetail;
  const outbound = routeGeoJsonByDirection(routeDetail, "outbound");
  const inbound = routeGeoJsonByDirection(routeDetail, "inbound");
  document.getElementById("routeGeoJsonTitle").textContent = `GeoJSON tuyến ${routeDetail.routeCode}`;
  document.getElementById("routeGeoJsonMeta").textContent = `${routeDetail.displayName || ""}`;
  document.querySelector("#routeGeoJsonModal .modal-body").innerHTML = `
    <div class="row g-3 mb-3">
      <div class="col-12 col-xl-6">
        <h6>Chiều đi</h6>
        <label class="form-label" for="routeGeoJsonFileOutbound">Upload GeoJSON chiều đi</label>
        <input id="routeGeoJsonFileOutbound" class="form-control mb-2" type="file" accept=".geojson,.json,application/geo+json,application/json">
        <textarea id="routeGeoJsonTextOutbound" class="form-control font-monospace" rows="11" spellcheck="false">${outbound.geoJson ? JSON.stringify(outbound.geoJson, null, 2) : ""}</textarea>
        <div id="routeGeoJsonMetaOutbound" class="small text-secondary mt-2">${outbound.name ? `${outbound.name} · ${new Date(outbound.updatedAt).toLocaleString("vi-VN")}` : "Chưa có GeoJSON chiều đi"}</div>
      </div>
      <div class="col-12 col-xl-6">
        <h6>Chiều về</h6>
        <label class="form-label" for="routeGeoJsonFileInbound">Upload GeoJSON chiều về</label>
        <input id="routeGeoJsonFileInbound" class="form-control mb-2" type="file" accept=".geojson,.json,application/geo+json,application/json">
        <textarea id="routeGeoJsonTextInbound" class="form-control font-monospace" rows="11" spellcheck="false">${inbound.geoJson ? JSON.stringify(inbound.geoJson, null, 2) : ""}</textarea>
        <div id="routeGeoJsonMetaInbound" class="small text-secondary mt-2">${inbound.name ? `${inbound.name} · ${new Date(inbound.updatedAt).toLocaleString("vi-VN")}` : "Chưa có GeoJSON chiều về"}</div>
      </div>
    </div>
    <div class="map-shell route-map"><div id="routeGeoJsonPreviewMap" class="h-100"></div></div>
  `;
  document.querySelector("#routeGeoJsonModal .modal-footer").innerHTML = `
    <button type="button" class="btn btn-outline-danger me-auto" id="deleteRouteGeoJsonOutbound"><i class="bi bi-trash"></i> Xóa chiều đi</button>
    <button type="button" class="btn btn-outline-danger me-auto" id="deleteRouteGeoJsonInbound"><i class="bi bi-trash"></i> Xóa chiều về</button>
    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Đóng</button>
    <button type="button" class="btn btn-primary" id="saveRouteGeoJson"><i class="bi bi-check2"></i> Lưu GeoJSON</button>
  `;

  const redrawPreview = () => drawRouteGeoJsonPreview({
    ...routeDetail,
    outboundGeoJson: parseGeoJsonText("outbound"),
    inboundGeoJson: parseGeoJsonText("inbound")
  });
  const handleFile = (direction) => async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    document.getElementById(`routeGeoJsonText${direction === "outbound" ? "Outbound" : "Inbound"}`).value = text;
    try {
      redrawPreview();
    } catch (error) {
      toast(`GeoJSON không hợp lệ: ${error.message}`, "danger");
    }
  };
  document.getElementById("routeGeoJsonFileOutbound").addEventListener("change", handleFile("outbound"));
  document.getElementById("routeGeoJsonFileInbound").addEventListener("change", handleFile("inbound"));
  document.getElementById("routeGeoJsonTextOutbound").addEventListener("input", () => {
    try { redrawPreview(); } catch {}
  });
  document.getElementById("routeGeoJsonTextInbound").addEventListener("input", () => {
    try { redrawPreview(); } catch {}
  });
  document.getElementById("saveRouteGeoJson").addEventListener("click", async () => {
    try {
      const outboundGeoJson = parseGeoJsonText("outbound");
      const inboundGeoJson = parseGeoJsonText("inbound");
      const outboundFile = document.getElementById("routeGeoJsonFileOutbound").files?.[0];
      const inboundFile = document.getElementById("routeGeoJsonFileInbound").files?.[0];
      if (outboundGeoJson) {
        await api(`/api/routes/${routeDetail._id}/geojson`, {
          method: "PUT",
          body: JSON.stringify({ direction: "outbound", geoJson: outboundGeoJson, fileName: outboundFile?.name || outbound.name })
        });
      }
      if (inboundGeoJson) {
        await api(`/api/routes/${routeDetail._id}/geojson`, {
          method: "PUT",
          body: JSON.stringify({ direction: "inbound", geoJson: inboundGeoJson, fileName: inboundFile?.name || inbound.name })
        });
      }
      state.routeGeoJsonModal.hide();
      toast("Đã lưu GeoJSON tuyến");
      await route();
    } catch (error) {
      toast(error.message, "danger");
    }
  });
  document.getElementById("deleteRouteGeoJsonOutbound").addEventListener("click", async () => {
    if (!confirm("Xóa GeoJSON chiều đi?")) return;
    await api(`/api/routes/${routeDetail._id}/geojson?direction=outbound`, { method: "DELETE" });
    state.routeGeoJsonModal.hide();
    toast("Đã xóa GeoJSON chiều đi");
    await route();
  });
  document.getElementById("deleteRouteGeoJsonInbound").addEventListener("click", async () => {
    if (!confirm("Xóa GeoJSON chiều về?")) return;
    await api(`/api/routes/${routeDetail._id}/geojson?direction=inbound`, { method: "DELETE" });
    state.routeGeoJsonModal.hide();
    toast("Đã xóa GeoJSON chiều về");
    await route();
  });
  state.routeGeoJsonModal.show();
  setTimeout(() => drawRouteGeoJsonPreview(routeDetail), 250);
}

async function loadVehicleTypeOptions(config) {
  const data = await api("/api/vehicle-types?limit=500");
  const options = (data.items || []).map((item) => ({
    value: item._id,
    label: `${item.name} (${item.seatCount || 0} chỗ)`,
    seatCount: item.seatCount || 0
  }));
  const field = config.fields.find((item) => item[0] === "vehicleType");
  if (field) field[4] = options;
  config.afterOpen = () => {
    const select = document.querySelector('#entityFields select[name="vehicleType"]');
    if (!select) return;
    const existing = document.getElementById("vehicleTypeSeatHint");
    if (existing) existing.remove();
    const hint = document.createElement("div");
    hint.id = "vehicleTypeSeatHint";
    hint.className = "col-12";
    document.getElementById("entityFields").appendChild(hint);
    const updateHint = () => {
      const seatCount = select.selectedOptions[0]?.dataset.seatCount || "";
      hint.innerHTML = seatCount
        ? `<div class="alert alert-info mb-0"><i class="bi bi-info-circle"></i> Số chỗ sẽ tự động lấy theo loại xe: <strong>${seatCount}</strong></div>`
        : '<div class="alert alert-warning mb-0">Hãy chọn loại xe đã được cấu hình trước khi lưu phương tiện.</div>';
    };
    select.addEventListener("change", updateHint);
    updateHint();
  };
}

function displayDirectionValue(direction) {
  const value = String(direction || "").toLowerCase();
  if (["ve", "backward", "inbound", "down"].includes(value)) return "VE";
  if (["di", "forward", "outbound", "up"].includes(value)) return "DI";
  return direction ? String(direction).toUpperCase() : "DI";
}

function ensureDisplayConfigModal() {
  let modal = document.getElementById("displayConfigModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal fade";
    modal.id = "displayConfigModal";
    modal.tabIndex = -1;
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="displayConfigTitle">Gui cau hinh OLED</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="displayConfigForm">
            <div class="modal-body">
              <div class="row g-3">
                <div class="col-12 col-md-6">
                  <label class="form-label">Route code</label>
                  <input class="form-control" name="routeCode" type="text">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label">Fare</label>
                  <input class="form-control" name="fare" type="text">
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label">Direction</label>
                  <select class="form-select" name="direction">
                    <option value="DI">DI</option>
                    <option value="VE">VE</option>
                  </select>
                </div>
                <div class="col-12 col-md-6">
                  <label class="form-label">Current stop</label>
                  <input class="form-control" name="currentStop" type="text">
                </div>
                <div class="col-12">
                  <label class="form-label">Next stop</label>
                  <input class="form-control" name="nextStop" type="text">
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Dong</button>
              <button type="submit" class="btn btn-primary"><i class="bi bi-cast"></i> Gui OLED</button>
            </div>
          </form>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  return { modal, instance: bootstrap.Modal.getOrCreateInstance(modal) };
}

function openDisplayConfigModal(row) {
  const { modal, instance } = ensureDisplayConfigModal();
  const form = modal.querySelector("#displayConfigForm");
  modal.querySelector("#displayConfigTitle").textContent = `Gui cau hinh OLED - ${row.deviceId}`;
  form.elements.routeCode.value = row.activeRouteCode || "";
  form.elements.fare.value = row.activeFare ?? "";
  form.elements.direction.value = displayDirectionValue(row.activeDirection);
  form.elements.currentStop.value = "";
  form.elements.nextStop.value = "";
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api(`/api/devices/${encodeURIComponent(row.deviceId)}/display-config`, {
        method: "POST",
        body: JSON.stringify({
          routeCode: form.elements.routeCode.value,
          fare: form.elements.fare.value,
          direction: form.elements.direction.value,
          currentStop: form.elements.currentStop.value,
          nextStop: form.elements.nextStop.value
        })
      });
      instance.hide();
      toast(`Da gui cau hinh OLED den ${row.deviceId}`);
    } catch (error) {
      toast(error.message, "danger");
    }
  };
  instance.show();
}

async function loadTerminalStopOptions(config) {
  const data = await api("/api/stops?terminal=true&limit=500");
  const options = (data.items || [])
    .filter((item) => item.terminal)
    .map((item) => ({
      value: item.name || item.stopCode,
      label: `${item.stopCode} - ${item.name || ""}`
    }));
  for (const fieldName of ["startPoint", "endPoint"]) {
    const field = config.fields.find((item) => item[0] === fieldName);
    if (field) field[4] = options;
  }
}

function openProfileModal() {
  state.accountMode = "profile";
  document.getElementById("accountModalTitle").textContent = "Thông tin cá nhân";
  document.getElementById("accountModalBody").innerHTML = `
    <div class="mb-3">
      <label class="form-label">Tên đăng nhập</label>
      <input class="form-control" value="${state.user.username}" disabled>
    </div>
    <div class="mb-3">
      <label class="form-label">Họ tên</label>
      <input class="form-control" name="fullName" value="${state.user.fullName || ""}" required>
    </div>
    <div class="mb-3">
      <label class="form-label">Vai trò</label>
      <input class="form-control" value="${state.user.role}" disabled>
    </div>
  `;
  state.accountModal.show();
}

function openPasswordModal() {
  state.accountMode = "password";
  document.getElementById("accountModalTitle").textContent = "Đổi mật khẩu";
  document.getElementById("accountModalBody").innerHTML = `
    <div class="mb-3">
      <label class="form-label">Mật khẩu hiện tại</label>
      <input class="form-control" name="currentPassword" type="password" autocomplete="current-password" required>
    </div>
    <div class="mb-3">
      <label class="form-label">Mật khẩu mới</label>
      <input class="form-control" name="newPassword" type="password" autocomplete="new-password" minlength="6" required>
    </div>
    <div class="mb-3">
      <label class="form-label">Nhập lại mật khẩu mới</label>
      <input class="form-control" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required>
    </div>
  `;
  state.accountModal.show();
}

function stopLabel(stop) {
  return `${stop.stopCode} - ${stop.name || ""}`;
}

function renderStopPicker() {
  const picker = document.getElementById("stopPicker");
  const selectedCodes = new Set(state.stopSorter.selected.map((stop) => stop.stopCode));
  const options = state.stopSorter.allStops
    .filter((stop) => !selectedCodes.has(stop.stopCode))
    .map((stop) => `<option value="${stop.stopCode}">${stopLabel(stop)}</option>`)
    .join("");
  picker.innerHTML = options || '<option value="">Tat ca diem dung da nam trong lo trinh</option>';
}

function moveStop(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= state.stopSorter.selected.length) return;
  const stops = state.stopSorter.selected;
  [stops[index], stops[next]] = [stops[next], stops[index]];
  renderStopSorter();
}

function renderStopSorter() {
  const list = document.getElementById("stopSorterList");
  const selected = state.stopSorter.selected;
  renderStopPicker();
  if (!selected.length) {
    list.innerHTML = '<div class="empty-state">Chua co diem dung trong chieu nay. Hay them diem dung tu danh sach ben tren.</div>';
    drawStopsMap("sorter", "stopSorterMap", [], { numbered: true, polyline: true });
    return;
  }

  list.innerHTML = selected.map((stop, index) => `
    <div class="stop-sorter-row" draggable="true" data-index="${index}" data-stop-code="${stop.stopCode}">
      <div class="stop-order-index">${index + 1}</div>
      <div class="min-w-0">
        <div class="fw-bold text-truncate">${stopLabel(stop)}</div>
        <div class="small text-secondary">${stop.address || ""} ${stop.lat && stop.lon ? `· ${stop.lat}, ${stop.lon}` : ""}</div>
      </div>
      <div class="stop-sorter-actions">
        <button class="btn btn-sm btn-outline-secondary" type="button" data-move-up="${index}" title="Len tren"><i class="bi bi-arrow-up"></i></button>
        <button class="btn btn-sm btn-outline-secondary" type="button" data-move-down="${index}" title="Xuong duoi"><i class="bi bi-arrow-down"></i></button>
        <button class="btn btn-sm btn-outline-danger" type="button" data-remove-stop="${index}" title="Xoa khoi lo trinh"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join("");
  drawStopsMap("sorter", "stopSorterMap", selected, { numbered: true, polyline: true, color: "#0b5ed7" });

  list.querySelectorAll("[data-move-up]").forEach((button) => button.addEventListener("click", () => moveStop(Number(button.dataset.moveUp), -1)));
  list.querySelectorAll("[data-move-down]").forEach((button) => button.addEventListener("click", () => moveStop(Number(button.dataset.moveDown), 1)));
  list.querySelectorAll("[data-remove-stop]").forEach((button) => button.addEventListener("click", () => {
    state.stopSorter.selected.splice(Number(button.dataset.removeStop), 1);
    renderStopSorter();
  }));
  list.querySelectorAll(".stop-sorter-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      list.querySelectorAll(".stop-sorter-row").forEach((item) => item.classList.remove("table-active"));
      row.classList.add("table-active");
      drawStopsMap("sorter", "stopSorterMap", selected, {
        numbered: true,
        polyline: true,
        color: "#0b5ed7",
        activeCode: row.dataset.stopCode
      });
    });
    row.addEventListener("dragstart", (event) => {
      row.classList.add("dragging");
      event.dataTransfer.setData("text/plain", row.dataset.index);
    });
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (event) => event.preventDefault());
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const from = Number(event.dataTransfer.getData("text/plain"));
      const to = Number(row.dataset.index);
      if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;
      const [item] = state.stopSorter.selected.splice(from, 1);
      state.stopSorter.selected.splice(to, 0, item);
      renderStopSorter();
    });
  });
}

async function renderCrud(key) {
  const config = crud[key];
  const canMutate = state.user.role === "admin";
  const canSendDisplayConfig = key === "devices" && ["admin", "dispatcher"].includes(state.user.role);
  root.innerHTML = `${pageTitle(config.title)}
    <section class="content-panel">
      <div class="toolbar">
        <div class="d-flex flex-wrap gap-2">
          <div class="input-group">
            <span class="input-group-text"><i class="bi bi-search"></i></span>
            <input id="searchInput" class="form-control" placeholder="${config.search || "Tìm kiếm"}">
          </div>
          <select id="statusFilter" class="form-select w-auto">
            <option value="">Tất cả trạng thái</option>
            ${(config.filters || ["active", "inactive"]).map((item) => `<option value="${item}">${item}</option>`).join("")}
          </select>
        </div>
        <div class="d-flex flex-wrap gap-2 justify-content-end">
          ${config.backLink || ""}
          ${config.extraToolbar || ""}
          ${key === "stops" && canMutate ? `<button class="btn btn-outline-primary" type="button" id="importStopsCsv"><i class="bi bi-upload"></i> Import CSV</button><input class="d-none" id="stopsCsvInput" type="file" accept=".csv,text/csv">` : ""}
          ${canMutate ? `<button class="btn btn-primary" id="addBtn"><i class="bi bi-plus-lg"></i> Thêm mới</button>` : ""}
        </div>
      </div>
      ${config.map === "stops" ? `
        <div class="row g-3">
          <div class="col-12 col-xl-8">
            <div id="tableHost" class="table-responsive"><div class="empty-state"><span class="spinner-border"></span></div></div>
          </div>
          <div class="col-12 col-xl-4">
            <div class="map-shell management-map"><div id="stopsMap" class="h-100"></div></div>
          </div>
        </div>
      ` : '<div id="tableHost" class="table-responsive"><div class="empty-state"><span class="spinner-border"></span></div></div>'}
    </section>`;

  const load = async () => {
    const params = new URLSearchParams({
      search: document.getElementById("searchInput").value,
      status: document.getElementById("statusFilter").value,
      limit: "50"
    });
    const data = await api(`${config.endpoint}?${params}`);
    const rows = data.items || [];
    if (!rows.length) {
      document.getElementById("tableHost").innerHTML = '<div class="empty-state">Chưa có dữ liệu phù hợp</div>';
      if (config.map === "stops") drawStopsMap("stops", "stopsMap", [], {});
      return;
    }
    document.getElementById("tableHost").innerHTML = `<table class="table table-hover">
      <thead><tr>${config.columns.map(([, label]) => `<th>${label}</th>`).join("")}<th class="text-end">Thao tác</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr class="${config.map === "stops" ? "clickable-row" : ""}" data-row-id="${row._id}">
          ${config.columns.map(([field]) => `<td>${field === "status" ? statusBadge(valueOf(row, field)) : valueOf(row, field)}</td>`).join("")}
          <td class="text-end">
            ${canSendDisplayConfig ? `<button class="btn btn-sm btn-outline-success" data-display-config="${row._id}" title="Gui cau hinh OLED"><i class="bi bi-cast"></i></button>` : ""}
            ${canMutate ? `<button class="btn btn-sm btn-outline-primary" data-edit="${row._id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-delete="${row._id}"><i class="bi bi-trash"></i></button>` : (canSendDisplayConfig ? "" : '<span class="badge badge-soft">Read only</span>')}
          </td>
        </tr>`).join("")}</tbody>
    </table>`;
    document.querySelectorAll("[data-display-config]").forEach((button) => button.addEventListener("click", () => {
      const row = rows.find((item) => item._id === button.dataset.displayConfig);
      if (row) openDisplayConfigModal(row);
    }));
    document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEntityModal(config, rows.find((row) => row._id === button.dataset.edit)).catch((error) => toast(error.message, "danger"))));
    document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Xóa bản ghi này?")) return;
      await api(`${config.endpoint}/${button.dataset.delete}`, { method: "DELETE" });
      toast("Đã xóa dữ liệu");
      load().catch((error) => toast(error.message, "danger"));
    }));
    if (config.map === "stops") {
      drawStopsMap("stops", "stopsMap", rows, {});
      document.querySelectorAll("#tableHost .clickable-row").forEach((rowEl) => {
        rowEl.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          const row = rows.find((item) => item._id === rowEl.dataset.rowId);
          if (!row) return;
          document.querySelectorAll("#tableHost .clickable-row").forEach((item) => item.classList.remove("table-active"));
          rowEl.classList.add("table-active");
          drawStopsMap("stops", "stopsMap", rows, { activeCode: row.stopCode, maxZoom: 17 });
        });
      });
    }
  };

  document.getElementById("searchInput").addEventListener("input", () => load().catch((error) => toast(error.message, "danger")));
  document.getElementById("statusFilter").addEventListener("change", () => load().catch((error) => toast(error.message, "danger")));
  document.getElementById("addBtn")?.addEventListener("click", () => openEntityModal(config).catch((error) => toast(error.message, "danger")));
  if (key === "stops") {
    document.getElementById("exportStopsTemplate")?.addEventListener("click", () => {
      window.location.href = "/api/stops/import-template";
    });
    document.getElementById("importStopsCsv")?.addEventListener("click", () => document.getElementById("stopsCsvInput")?.click());
    document.getElementById("stopsCsvInput")?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const csv = await file.text();
        const result = await api("/api/stops/import-csv", {
          method: "POST",
          body: JSON.stringify({ csv })
        });
        toast(`Da import ${result.total} diem dung: tao moi ${result.created}, cap nhat ${result.updated}`);
        event.target.value = "";
        await load();
      } catch (error) {
        toast(error.message, "danger");
      }
    });
  }
  await load();
}

async function renderRoutes() {
  const canMutate = state.user.role === "admin";
  root.innerHTML = `${pageTitle("Quản lý tuyến và lộ trình", "Route config offline-first cho ESP32 được export thành file JSON để copy vào SD Card.")}
    <section class="content-panel">
      <div class="alert offline-note">
        Thiết bị ESP32 đọc route từ SD Card. Hệ thống không gửi ROUTE_DETAIL, ROUTE_MANIFEST hoặc danh sách điểm dừng qua MQTT.
      </div>
      <div class="toolbar">
        <div class="input-group">
          <span class="input-group-text"><i class="bi bi-search"></i></span>
          <input id="searchInput" class="form-control" placeholder="Route code, tên tuyến">
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-primary" id="exportAllBtn"><i class="bi bi-download"></i> Export All Routes</button>
          ${canMutate ? '<button class="btn btn-primary" id="addRouteBtn"><i class="bi bi-plus-lg"></i> Thêm tuyến</button>' : ""}
        </div>
      </div>
      <div class="row g-3">
        <div class="col-12 col-xl-8">
          <div id="tableHost" class="table-responsive"><div class="empty-state"><span class="spinner-border"></span></div></div>
        </div>
        <div class="col-12 col-xl-4">
          <div class="map-shell route-map"><div id="routeMap" class="h-100"></div></div>
          <div id="routeMapHint" class="small text-secondary mt-2">Chọn một tuyến để xem GeoJSON. Bản đồ này không tự nối các điểm dừng.</div>
        </div>
      </div>
    </section>`;

  const routeConfig = {
    title: "Quản lý tuyến và lộ trình",
    endpoint: "/api/routes",
    fields: [
      ["routeCode", "Route code", "text", true],
      ["displayName", "Tên hiển thị", "text", true],
      ["startPoint", "Điểm đầu", "select", false, []],
      ["endPoint", "Điểm cuối", "select", false, []],
      ["operatingTime", "Thời gian hoạt động", "text"],
      ["frequency", "Tần suất", "text"],
      ["fare", "Giá vé", "number"],
      ["status", "Trạng thái", "select", false, ["active", "inactive"]]
    ],
    prepareFields: loadTerminalStopOptions
  };

  const download = (url) => {
    window.location.href = url;
  };

  const stopLabel = (stop) => `${stop.stopCode} - ${stop.name || ""}`;

  const renderStopPicker = () => {
    const picker = document.getElementById("stopPicker");
    const selectedCodes = new Set(state.stopSorter.selected.map((stop) => stop.stopCode));
    const options = state.stopSorter.allStops
      .filter((stop) => !selectedCodes.has(stop.stopCode))
      .map((stop) => `<option value="${stop.stopCode}">${stopLabel(stop)}</option>`)
      .join("");
    picker.innerHTML = options || '<option value="">Tat ca diem dung da nam trong lo trinh</option>';
  };

  const renderStopSorter = () => {
    const list = document.getElementById("stopSorterList");
    const selected = state.stopSorter.selected;
    renderStopPicker();
    if (!selected.length) {
      list.innerHTML = '<div class="empty-state">Chua co diem dung trong chieu nay. Hay them diem dung tu danh sach ben tren.</div>';
      drawStopsMap("sorter", "stopSorterMap", [], { numbered: true, polyline: true });
      return;
    }

    list.innerHTML = selected.map((stop, index) => `
      <div class="stop-sorter-row" draggable="true" data-index="${index}" data-stop-code="${stop.stopCode}">
        <div class="stop-order-index">${index + 1}</div>
        <div class="min-w-0">
          <div class="fw-bold text-truncate">${stopLabel(stop)}</div>
          <div class="small text-secondary">${stop.address || ""} ${stop.lat && stop.lon ? `· ${stop.lat}, ${stop.lon}` : ""}</div>
        </div>
        <div class="stop-sorter-actions">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-move-up="${index}" title="Len tren"><i class="bi bi-arrow-up"></i></button>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-move-down="${index}" title="Xuong duoi"><i class="bi bi-arrow-down"></i></button>
          <button class="btn btn-sm btn-outline-danger" type="button" data-remove-stop="${index}" title="Xoa khoi lo trinh"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `).join("");
    drawStopsMap("sorter", "stopSorterMap", selected, { numbered: true, polyline: true, color: "#0b5ed7" });

    list.querySelectorAll("[data-move-up]").forEach((button) => button.addEventListener("click", () => moveStop(Number(button.dataset.moveUp), -1)));
    list.querySelectorAll("[data-move-down]").forEach((button) => button.addEventListener("click", () => moveStop(Number(button.dataset.moveDown), 1)));
    list.querySelectorAll("[data-remove-stop]").forEach((button) => button.addEventListener("click", () => {
      state.stopSorter.selected.splice(Number(button.dataset.removeStop), 1);
      renderStopSorter();
    }));
    list.querySelectorAll(".stop-sorter-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        list.querySelectorAll(".stop-sorter-row").forEach((item) => item.classList.remove("table-active"));
        row.classList.add("table-active");
        drawStopsMap("sorter", "stopSorterMap", selected, {
          numbered: true,
          polyline: true,
          color: "#0b5ed7",
          activeCode: row.dataset.stopCode
        });
      });
      row.addEventListener("dragstart", (event) => {
        row.classList.add("dragging");
        event.dataTransfer.setData("text/plain", row.dataset.index);
      });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      row.addEventListener("dragover", (event) => event.preventDefault());
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer.getData("text/plain"));
        const to = Number(row.dataset.index);
        if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;
        const [item] = state.stopSorter.selected.splice(from, 1);
        state.stopSorter.selected.splice(to, 0, item);
        renderStopSorter();
      });
    });
  };

  const moveStop = (index, delta) => {
    const next = index + delta;
    if (next < 0 || next >= state.stopSorter.selected.length) return;
    const stops = state.stopSorter.selected;
    [stops[index], stops[next]] = [stops[next], stops[index]];
    renderStopSorter();
  };

  const openDirectionSorter = async (routeRow, direction) => {
    const [routeDetail, stopsData] = await Promise.all([
      api(`/api/routes/${routeRow._id}`),
      api("/api/stops?limit=500")
    ]);
    const selectedByDirection = (nextDirection) => {
      const routeDirection = (routeDetail.directions || []).find((item) => item.direction === nextDirection);
      return (routeDirection?.stops || [])
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => item.stop || { stopCode: item.stopCode })
      .filter((stop) => stop.stopCode);
    };

    state.stopSorter = {
      routeCode: routeRow.routeCode,
      displayName: routeRow.displayName,
      direction,
      allStops: stopsData.items || [],
      selected: selectedByDirection(direction)
    };
    document.getElementById("stopSorterTitle").textContent = "Sắp xếp điểm dừng";
    document.getElementById("stopSorterMeta").innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mt-2">
        <span>${routeRow.routeCode} - ${routeRow.displayName}</span>
        <select id="stopSorterDirection" class="form-select form-select-sm w-auto">
          <option value="outbound" ${direction === "outbound" ? "selected" : ""}>Chiều đi</option>
          <option value="inbound" ${direction === "inbound" ? "selected" : ""}>Chiều về</option>
        </select>
      </div>
    `;
    document.getElementById("stopSorterDirection").addEventListener("change", (event) => {
      state.stopSorter.direction = event.target.value;
      state.stopSorter.selected = selectedByDirection(event.target.value);
      renderStopSorter();
    });
    renderStopSorter();
    state.stopSorterModal.show();
  };

  const load = async () => {
    const data = await api(`/api/routes?search=${encodeURIComponent(document.getElementById("searchInput").value)}&limit=50`);
    const rows = data.items || [];
    if (!rows.length) {
      document.getElementById("tableHost").innerHTML = '<div class="empty-state">Chưa có tuyến</div>';
      return;
    }
    document.getElementById("tableHost").innerHTML = `<table class="table table-hover">
      <thead><tr><th>Route code</th><th>Tên tuyến</th><th>Version</th><th>Điểm đầu</th><th>Điểm cuối</th><th>Giá vé</th><th>Thời gian tạo</th><th>Lần chỉnh sửa gần nhất</th><th>GeoJSON</th><th>Outbound</th><th>Inbound</th><th>Trạng thái</th><th class="text-end">Thao tác</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr class="clickable-row" data-route-id="${row._id}">
          <td><strong>${row.routeCode}</strong></td><td>${row.displayName}</td><td><span class="badge text-bg-info">${row.version || 1}</span></td><td>${row.startPoint || ""}</td><td>${row.endPoint || ""}</td>
          <td>${formatFare(row.fare)}</td><td>${formatDateTime(row.createdAt)}</td><td>${formatDateTime(row.updatedAt)}</td><td><span class="badge ${row.hasOutboundGeoJson ? "text-bg-success" : "text-bg-secondary"}">Đi</span> <span class="badge ${row.hasInboundGeoJson ? "text-bg-success" : "text-bg-secondary"}">Về</span></td><td>${row.outboundCount}</td><td>${row.inboundCount}</td><td>${statusBadge(row.status)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary" data-export="${row.routeCode}"><i class="bi bi-download"></i> JSON</button>
            <button class="btn btn-sm btn-outline-primary" data-geojson="${row._id}"><i class="bi bi-map"></i> GeoJSON</button>
            ${canMutate ? `<button class="btn btn-sm btn-outline-secondary" data-sort-stops="${row.routeCode}"><i class="bi bi-list-ol"></i> Sắp xếp điểm dừng</button>
            <button class="btn btn-sm btn-outline-warning" data-increase-version="${row._id}" title="Tăng version route config"><i class="bi bi-arrow-up-circle"></i> Version</button>
            <button class="btn btn-sm btn-outline-primary" data-edit="${row._id}"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-delete="${row._id}"><i class="bi bi-trash"></i></button>` : ""}
          </td>
        </tr>`).join("")}</tbody>
    </table>`;
    document.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", () => download(`/api/routes/export/${button.dataset.export}`)));
    document.querySelectorAll("[data-geojson]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      openRouteGeoJsonModal(rows.find((row) => row._id === button.dataset.geojson)).catch((error) => toast(error.message, "danger"));
    }));
    document.querySelectorAll("[data-sort-stops]").forEach((button) => button.addEventListener("click", () => openDirectionSorter(rows.find((row) => row.routeCode === button.dataset.sortStops), "outbound").catch((error) => toast(error.message, "danger"))));
    document.querySelectorAll("[data-increase-version]").forEach((button) => button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const route = rows.find((row) => row._id === button.dataset.increaseVersion);
      if (!route) return;
      const updated = await api(`/api/routes/${route._id}/increase-version`, { method: "PUT" });
      toast(`Da tang version ${route.routeCode} len ${updated.version}`);
      await load();
    }));
    document.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEntityModal(routeConfig, rows.find((row) => row._id === button.dataset.edit)).catch((error) => toast(error.message, "danger"))));
    document.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Xóa tuyến này?")) return;
      await api(`/api/routes/${button.dataset.delete}`, { method: "DELETE" });
      toast("Đã xóa tuyến");
      load().catch((error) => toast(error.message, "danger"));
    }));
    document.querySelectorAll("#tableHost .clickable-row").forEach((rowEl) => {
      rowEl.addEventListener("click", async (event) => {
        if (event.target.closest("button")) return;
        try {
          document.querySelectorAll("#tableHost .clickable-row").forEach((item) => item.classList.remove("table-active"));
          rowEl.classList.add("table-active");
          const routeDetail = await api(`/api/routes/${rowEl.dataset.routeId}`);
          drawRouteDirectionsMap(routeDetail);
          document.getElementById("routeMapHint").textContent = routeDetail.outboundGeoJson || routeDetail.inboundGeoJson || routeDetail.geoJson
            ? `${routeDetail.routeCode} - ${routeDetail.displayName} · xanh dương: chiều đi, xanh lá: chiều về`
            : `${routeDetail.routeCode} chưa có GeoJSON`;
        } catch (error) {
          toast(error.message, "danger");
        }
      });
    });
  };

  document.getElementById("exportAllBtn").addEventListener("click", () => download("/api/routes/export-all"));
  document.getElementById("addRouteBtn")?.addEventListener("click", () => openEntityModal(routeConfig).catch((error) => toast(error.message, "danger")));
  document.getElementById("searchInput").addEventListener("input", () => load().catch((error) => toast(error.message, "danger")));
  await load();
}

async function renderMonitoring() {
  state.monitoringFullscreen = false;
  state.monitoringSelectedKey = null;
  state.monitoringDrawnRouteKey = null;
  if (state.monitoringTimer) {
    clearInterval(state.monitoringTimer);
    state.monitoringTimer = null;
  }
  if (state.monitoringKeyHandler) {
    document.removeEventListener("keydown", state.monitoringKeyHandler);
    state.monitoringKeyHandler = null;
  }
  if (state.monitoringFullscreenHandler) {
    document.removeEventListener("fullscreenchange", state.monitoringFullscreenHandler);
    state.monitoringFullscreenHandler = null;
  }
  clearMonitoringVehicleMarkers();
  root.innerHTML = `${pageTitle("Giám sát phương tiện")}
    <div class="monitoring-stage row g-3" id="monitoringStage">
      <div class="monitoring-map-column col-12 col-xl-8">
        <div class="map-shell monitoring-map-shell">
          <button class="btn btn-light monitoring-fullscreen-btn" id="monitoringFullscreenBtn" type="button" title="Hiển thị toàn màn hình">
            <i class="bi bi-arrows-fullscreen"></i>
          </button>
          <div id="vehicleMap"></div>
        </div>
      </div>
      <div class="monitoring-list-column col-12 col-xl-4">
        <section class="content-panel monitoring-list-panel h-100">
          <div class="toolbar">
            <h2 class="h5 m-0">Xe đang hoạt động</h2>
            <button class="btn btn-outline-primary btn-sm" id="refreshBtn" type="button" title="Làm mới"><i class="bi bi-arrow-clockwise"></i></button>
          </div>
          <div class="small text-secondary mb-1" id="monitoringRouteHint">Chon xe de hien thi tuyen</div>
          <div class="small text-secondary mb-2" id="monitoringRefreshStatus">Tu dong cap nhat moi 3 giay</div>
          <div id="vehicleList"></div>
        </section>
      </div>
    </div>`;

  const updateFullscreenButton = () => {
    const button = document.getElementById("monitoringFullscreenBtn");
    if (!button) return;
    button.innerHTML = state.monitoringFullscreen
      ? '<i class="bi bi-fullscreen-exit"></i>'
      : '<i class="bi bi-arrows-fullscreen"></i>';
    button.title = state.monitoringFullscreen ? "Thoát toàn màn hình" : "Hiển thị toàn màn hình";
  };

  const applyMonitoringFullscreen = (enabled) => {
    state.monitoringFullscreen = enabled;
    document.getElementById("monitoringStage")?.classList.toggle("is-control-room", enabled);
    document.body.classList.toggle("monitoring-fullscreen-open", enabled);
    updateFullscreenButton();
    setTimeout(() => state.map?.invalidateSize(), 120);
  };

  const setMonitoringFullscreen = (enabled) => {
    const stage = document.getElementById("monitoringStage");
    applyMonitoringFullscreen(enabled);
    if (enabled && stage?.requestFullscreen && !document.fullscreenElement) {
      stage.requestFullscreen().catch(() => {});
    }
    if (!enabled && document.fullscreenElement === stage) {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  state.monitoringKeyHandler = (event) => {
    if (event.key === "Escape" && state.monitoringFullscreen) setMonitoringFullscreen(false);
  };
  document.addEventListener("keydown", state.monitoringKeyHandler);
  state.monitoringFullscreenHandler = () => {
    const stage = document.getElementById("monitoringStage");
    if (state.monitoringFullscreen && document.fullscreenElement !== stage) {
      applyMonitoringFullscreen(false);
    }
  };
  document.addEventListener("fullscreenchange", state.monitoringFullscreenHandler);

  const load = async () => {
    const data = await api("/api/monitoring/vehicles");
    const rows = data.items || [];
    if (!state.map) {
      state.map = L.map("vehicleMap", { zoomControl: false, preferCanvas: true }).setView([21.0285, 105.8542], 12);
      addBaseMap(state.map);
      L.control.zoom({ position: "bottomright" }).addTo(state.map);
    }
    const rowsWithGps = rows.filter((row) => Number.isFinite(Number(row.gps?.lat)) && Number.isFinite(Number(row.gps?.lng)));
    updateMonitoringVehicleMarkers(rowsWithGps);
    if (state.markers.length && !state.monitoringSelectedKey) {
      state.map.fitBounds(L.featureGroup(state.markers).getBounds().pad(0.2));
    } else if (!state.monitoringSelectedKey) {
      state.map.setView([21.0285, 105.8542], 12);
    }
    document.getElementById("vehicleList").innerHTML = rows.length ? rows.map((row) => `
      <div class="border-bottom py-3 clickable-row ${state.monitoringSelectedKey === monitoringKey(row) ? "table-active" : ""}" data-monitoring-order="${monitoringKey(row)}">
        <div class="small text-secondary">Runtime: ${row.runtime?.routeId || "-"} ${row.runtime?.direction || ""} - Source: ${row.stateSource === "esp32" ? "ESP32" : "dispatch"}</div>
        <div class="small">${Number.isInteger(row.runtime?.currentStop) ? `Current stop: ${row.runtime.currentStop}` : ""}${Number.isInteger(row.runtime?.nextStop) ? ` - Next: ${row.runtime.nextStop}` : ""}</div>
        ${monitoringNextStopLine(row)}
        <div class="d-flex justify-content-between gap-2"><strong>${row.vehiclePlate || "Chưa gắn xe"}</strong>${statusBadge(row.status)}</div>
        <div class="small text-secondary">Thiết bị: ${row.deviceId} · Tuyến: ${row.runtime?.routeId || "-"} · Chiều: ${row.runtime?.direction || "-"}</div>
        <div class="small">Xuất bến: ${row.departureAt ? new Date(row.departureAt).toLocaleString("vi-VN") : "-"}</div>
        <div class="small">${row.gps?.status === "lost" ? "Mất GPS" : `Tốc độ: ${row.gps?.speed || 0} km/h`} · GPS cuối: ${row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("vi-VN") : "Chưa có dữ liệu"}</div>
      </div>
    `).join("") : '<div class="empty-state">Chưa có vé lệnh đang hoạt động</div>';
    document.querySelectorAll("[data-monitoring-order]").forEach((item) => {
      item.addEventListener("click", async () => {
        const row = rows.find((entry) => monitoringKey(entry) === item.dataset.monitoringOrder);
        state.monitoringSelectedKey = item.dataset.monitoringOrder;
        document.querySelectorAll("[data-monitoring-order]").forEach((el) => el.classList.remove("table-active"));
        item.classList.add("table-active");
        await drawMonitoringRoute(row, { fit: true });
        const point = monitoringLatLng(row);
        if (point) {
          if (!state.mapLayers.monitoringRoute) state.map.setView(point, 16);
          const marker = state.markers.find((entry) => String(entry.monitoringKey) === monitoringKey(row));
          marker?.openPopup();
        } else {
          state.map.setView([21.0285, 105.8542], 12);
          toast("Xe đang có vé lệnh nhưng chưa có dữ liệu GPS", "warning");
        }
      });
    });
    const selectedRow = rows.find((row) => monitoringKey(row) === state.monitoringSelectedKey);
    if (state.monitoringSelectedKey && selectedRow) await drawMonitoringRoute(selectedRow);
    if (state.monitoringSelectedKey && !selectedRow) {
      state.monitoringSelectedKey = null;
      state.monitoringDrawnRouteKey = null;
      removeLayerSafely("monitoringRoute");
    }
    const status = document.getElementById("monitoringRefreshStatus");
    if (status) status.textContent = `Cap nhat luc ${new Date().toLocaleTimeString("vi-VN")}`;
  };

  document.getElementById("refreshBtn").addEventListener("click", () => load().catch((error) => toast(error.message, "danger")));
  state.monitoringTimer = setInterval(() => {
    if (state.route !== "monitoring") return;
    load().catch((error) => {
      const status = document.getElementById("monitoringRefreshStatus");
      if (status) status.textContent = `Loi cap nhat: ${error.message}`;
    });
  }, 3000);
  document.getElementById("monitoringFullscreenBtn").addEventListener("click", () => {
    setMonitoringFullscreen(!state.monitoringFullscreen);
  });
  setTimeout(() => state.map?.invalidateSize(), 200);
  await load();
}

async function renderDispatch() {
  const [devicesData, routesData, vehiclesData] = await Promise.all([
    api("/api/devices?limit=500"),
    api("/api/routes?limit=500"),
    api("/api/vehicles?limit=500")
  ]);
  const devices = devicesData.items || [];
  const routes = routesData.items || [];
  const vehicles = vehiclesData.items || [];

  root.innerHTML = `${pageTitle("Điều phối phương tiện")}
    <div class="row g-3">
      <div class="col-12 col-xl-4">
        <section class="content-panel">
          <div class="alert offline-note">
            ESP nhận lifecycle vé lệnh retained và route detail bằng MQTT chunk trên topic bus/{deviceId}/config.
          </div>
          <form id="dispatchForm" class="row g-3">
            <div class="col-12">
              <label class="form-label">Device ID</label>
              <select class="form-select" name="deviceId" required>
                <option value="">Chọn thiết bị</option>
                ${devices.map((item) => `<option value="${item.deviceId}">${item.deviceId}${item.vehicle?.plateNumber ? ` - ${item.vehicle.plateNumber}` : ""}</option>`).join("")}
              </select>
            </div>
            <div class="col-12">
              <label class="form-label">Biển số xe</label>
              <select class="form-select" name="vehicleId" required>
                <option value="">Chọn xe</option>
                ${vehicles.map((item) => `<option value="${item._id}">${item.plateNumber} - ${item.vehicleCode || ""}${item.currentRoute ? ` (${item.currentRoute})` : ""}</option>`).join("")}
              </select>
            </div>
            <div class="col-12">
              <label class="form-label">Route code</label>
              <select class="form-select" name="routeCode" required>
                <option value="">Chọn tuyến</option>
                ${routes.map((item) => `<option value="${item.routeCode}">${item.routeCode} - ${item.displayName}</option>`).join("")}
              </select>
            </div>
            <div class="col-12">
              <label class="form-label">Direction</label>
              <select class="form-select" name="direction">
                <option value="outbound">outbound</option>
                <option value="inbound">inbound</option>
              </select>
            </div>
            <div class="col-12">
              <label class="form-label">Thời gian xuất bến</label>
              <input class="form-control" type="datetime-local" name="departureAt">
            </div>
            <div class="col-12">
              <label class="form-label">Loại lệnh</label>
              <select class="form-select" name="commandType">
                <option value="ROUTE_OVERRIDE">Điều xe chạy tuyến</option>
                <option value="UNLOCK_TRIP">Mở khóa chuyến</option>
                <option value="LOCK_TRIP">Khóa chuyến</option>
                <option value="ROUTE_VERSION">Thông báo version tuyến</option>
              </select>
            </div>
            <div class="col-12"><button class="btn btn-primary w-100"><i class="bi bi-send"></i> Tạo vé lệnh</button></div>
          </form>
        </section>
      </div>
      <div class="col-12 col-xl-8">
        <section class="content-panel">
          <div class="toolbar">
            <h2 class="h5 m-0">Lịch sử vé lệnh điều phối</h2>
            <button class="btn btn-outline-primary btn-sm" id="refreshOrders"><i class="bi bi-arrow-clockwise"></i></button>
          </div>
          <div id="ordersHost"></div>
        </section>
      </div>
    </div>`;

  const loadOrders = async () => {
    const data = await api("/api/dispatch-orders?limit=50");
    const rows = data.items || [];
    document.getElementById("ordersHost").innerHTML = rows.length ? `<div class="table-responsive"><table class="table table-hover">
      <thead><tr><th>Thiết bị</th><th>Biển số</th><th>Tuyến</th><th>Chiều</th><th>Xuất bến</th><th>Về bến</th><th>Trạng thái</th><th class="text-end">Thao tác</th></tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td>${row.deviceId}</td>
        <td>${row.vehicle?.plateNumber || ""}</td>
        <td>${row.routeCode || ""}</td>
        <td>${row.direction || ""}</td>
        <td>${row.departureAt ? new Date(row.departureAt).toLocaleString("vi-VN") : ""}</td>
        <td>${row.returnAt ? new Date(row.returnAt).toLocaleString("vi-VN") : `<input class="form-control form-control-sm" type="datetime-local" data-return-time="${row._id}">`}</td>
        <td>${statusBadge(row.status)}</td>
        <td class="text-end">
          ${row.status !== "returned" ? `
            <button class="btn btn-sm btn-outline-primary" data-change-direction="${row._id}" data-next-direction="${row.direction === "inbound" ? "outbound" : "inbound"}"><i class="bi bi-arrow-left-right"></i> Doi chieu</button>
            <button class="btn btn-sm btn-outline-danger" data-delete-order="${row._id}"><i class="bi bi-trash"></i> Xoa</button>
          ` : ""}
          ${row.status !== "returned" ? `<button class="btn btn-sm btn-outline-success" data-return="${row._id}"><i class="bi bi-box-arrow-in-down"></i> Về bến</button>` : '<span class="badge badge-soft">Đã về bến</span>'}
        </td>
      </tr>`).join("")}</tbody>
    </table></div>` : '<div class="empty-state">Chưa có vé lệnh điều phối</div>';

    document.querySelectorAll("[data-change-direction]").forEach((button) => button.addEventListener("click", async () => {
      await api(`/api/dispatch-orders/${button.dataset.changeDirection}/change-direction`, {
        method: "POST",
        body: JSON.stringify({ direction: button.dataset.nextDirection })
      });
      toast("Da doi chieu ve lenh va gui MQTT retained");
      await loadOrders();
    }));

    document.querySelectorAll("[data-return]").forEach((button) => button.addEventListener("click", async () => {
      const input = document.querySelector(`[data-return-time="${button.dataset.return}"]`);
      const returnAt = input?.value ? new Date(input.value).toISOString() : new Date().toISOString();
      await api(`/api/dispatch-orders/${button.dataset.return}/return-depot`, {
        method: "POST",
        body: JSON.stringify({ returnAt })
      });
      toast("Đã ghi nhận xe về bến và gỡ liên kết thiết bị");
      await loadOrders();
    }));

    document.querySelectorAll("[data-delete-order]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Xoa ve lenh nay? ESP se nhan DISPATCH_ENDED retained neu ve lenh dang active.")) return;
      await api(`/api/dispatch-orders/${button.dataset.deleteOrder}`, { method: "DELETE" });
      toast("Da xoa ve lenh va gui clear dispatch neu can");
      await loadOrders();
    }));
  };

  document.getElementById("dispatchForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = formPayload(form);
    await api("/api/dispatch-orders", { method: "POST", body: JSON.stringify(payload) });
    toast("Đã tạo vé lệnh điều phối");
    form.reset();
    await loadOrders();
  });
  document.getElementById("refreshOrders").addEventListener("click", () => loadOrders().catch((error) => toast(error.message, "danger")));
  await loadOrders();
}

async function renderLogs() {
  root.innerHTML = `${pageTitle("Log Activity")}
    <section class="content-panel">
      <div class="toolbar">
        <input id="moduleFilter" class="form-control w-auto" placeholder="Module">
        <input id="actionFilter" class="form-control w-auto" placeholder="Action">
        <button class="btn btn-outline-primary" id="filterBtn"><i class="bi bi-funnel"></i> Lọc</button>
      </div>
      <div id="logsHost"></div>
    </section>`;
  const load = async () => {
    const params = new URLSearchParams({ module: document.getElementById("moduleFilter").value, action: document.getElementById("actionFilter").value });
    const data = await api(`/api/logs?${params}`);
    const rows = data.items || [];
    document.getElementById("logsHost").innerHTML = rows.length ? `<div class="table-responsive"><table class="table table-hover">
      <thead><tr><th>Thời gian</th><th>Người dùng</th><th>Action</th><th>Module</th><th>Target</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${new Date(row.createdAt).toLocaleString("vi-VN")}</td><td>${row.user?.username || "system"}</td><td>${row.action}</td><td>${row.module}</td><td>${row.targetId || ""}</td></tr>`).join("")}</tbody>
    </table></div>` : '<div class="empty-state">Chưa có log</div>';
  };
  document.getElementById("filterBtn").addEventListener("click", () => load().catch((error) => toast(error.message, "danger")));
  await load();
}

async function route() {
  state.route = location.hash.replace("#", "") || "dashboard";
  if (!modules.find((item) => item.key === state.route && canOpen(item))) state.route = "dashboard";
  renderNav();
  document.body.classList.remove("monitoring-fullscreen-open");
  state.monitoringFullscreen = false;
  state.monitoringSelectedKey = null;
  state.monitoringDrawnRouteKey = null;
  if (state.monitoringTimer) {
    clearInterval(state.monitoringTimer);
    state.monitoringTimer = null;
  }
  if (state.monitoringKeyHandler) {
    document.removeEventListener("keydown", state.monitoringKeyHandler);
    state.monitoringKeyHandler = null;
  }
  if (state.monitoringFullscreenHandler) {
    document.removeEventListener("fullscreenchange", state.monitoringFullscreenHandler);
    state.monitoringFullscreenHandler = null;
  }
  if (state.map) {
    clearMonitoringVehicleMarkers();
    try {
      state.map.remove();
    } catch {
      // Ignore stale monitoring map refs.
    }
  }
  state.map = null;
  state.markers = [];
  resetManagedMaps();
  if (state.route === "dashboard") return renderDashboard();
  if (state.route === "routes") return renderRoutes();
  if (state.route === "monitoring") return renderMonitoring();
  if (state.route === "dispatch") return renderDispatch();
  if (state.route === "logs") return renderLogs();
  if (crud[state.route]) return renderCrud(state.route);
  return renderDashboard();
}

async function boot() {
  try {
    state.user = await api("/api/auth/me");
    document.getElementById("currentUser").textContent = state.user.fullName || state.user.username;
    document.getElementById("currentRole").textContent = `Vai trò: ${state.user.role}`;
    state.modal = new bootstrap.Modal(document.getElementById("entityModal"));
    state.accountModal = new bootstrap.Modal(document.getElementById("accountModal"));
    state.stopSorterModal = new bootstrap.Modal(document.getElementById("stopSorterModal"));
    state.routeGeoJsonModal = new bootstrap.Modal(document.getElementById("routeGeoJsonModal"));
    document.getElementById("stopSorterModal").addEventListener("shown.bs.modal", () => {
      state.maps.sorter?.invalidateSize();
      if (state.stopSorter?.selected) {
        drawStopsMap("sorter", "stopSorterMap", state.stopSorter.selected, {
          numbered: true,
          polyline: true,
          color: "#0b5ed7"
        });
      }
    });
    document.getElementById("routeGeoJsonModal").addEventListener("shown.bs.modal", () => {
      try {
        const geoJson = parseGeoJsonText();
        drawGeoJsonPreview(geoJson);
      } catch (error) {
        toast(`GeoJSON không hợp lệ: ${error.message}`, "danger");
      }
    });
    document.getElementById("routeGeoJsonFile").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      document.getElementById("routeGeoJsonText").value = text;
      try {
        drawGeoJsonPreview(JSON.parse(text));
      } catch (error) {
        toast(`GeoJSON không hợp lệ: ${error.message}`, "danger");
      }
    });
    document.getElementById("routeGeoJsonText").addEventListener("input", () => {
      try {
        const geoJson = parseGeoJsonText();
        drawGeoJsonPreview(geoJson);
      } catch {
        // Wait until the user finishes editing valid JSON.
      }
    });
    document.getElementById("saveRouteGeoJson").addEventListener("click", async () => {
      try {
        if (!state.routeGeoJson) return;
        const file = document.getElementById("routeGeoJsonFile").files?.[0];
        const geoJson = parseGeoJsonText();
        const direction = state.routeGeoJsonDirection;
        await api(`/api/routes/${state.routeGeoJson._id}/geojson`, {
          method: "PUT",
          body: JSON.stringify({
            geoJson,
            direction,
            fileName: file?.name || routeGeoJsonByDirection(state.routeGeoJson, direction).name
          })
        });
        state.routeGeoJsonModal.hide();
        toast("Đã lưu GeoJSON tuyến");
        await route();
      } catch (error) {
        toast(error.message, "danger");
      }
    });
    document.getElementById("deleteRouteGeoJson").addEventListener("click", async () => {
      try {
        if (!state.routeGeoJson || !confirm("Xóa GeoJSON của tuyến này?")) return;
        await api(`/api/routes/${state.routeGeoJson._id}/geojson?direction=${state.routeGeoJsonDirection}`, { method: "DELETE" });
        state.routeGeoJsonModal.hide();
        toast("Đã xóa GeoJSON tuyến");
        await route();
      } catch (error) {
        toast(error.message, "danger");
      }
    });
    document.getElementById("addStopToDirection").addEventListener("click", () => {
      const picker = document.getElementById("stopPicker");
      const stopCode = picker.value;
      if (!stopCode || !state.stopSorter) return;
      const stop = state.stopSorter.allStops.find((item) => item.stopCode === stopCode);
      if (!stop) return;
      state.stopSorter.selected.push(stop);
      renderStopSorter();
    });
    document.getElementById("saveStopOrder").addEventListener("click", async () => {
      if (!state.stopSorter) return;
      const stops = state.stopSorter.selected.map((stop, index, all) => ({
        stopCode: stop.stopCode,
        order: index + 1,
        terminal: index === 0 || index === all.length - 1
      }));
      await api(`/api/routes/${state.stopSorter.routeCode}/direction`, {
        method: "PUT",
        body: JSON.stringify({ direction: state.stopSorter.direction, stops })
      });
      state.stopSorterModal.hide();
      toast("Da luu thu tu diem dung");
      await route();
    });
    document.getElementById("entityForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const { config, item } = state.editing;
      const method = item ? "PUT" : "POST";
      const url = item ? `${config.endpoint}/${item._id}` : config.endpoint;
      await api(url, { method, body: JSON.stringify(formPayload(event.currentTarget)) });
      state.modal.hide();
      toast("Đã lưu dữ liệu");
      route().catch((error) => toast(error.message, "danger"));
    });
    document.querySelector('[data-action="profile"]').addEventListener("click", openProfileModal);
    document.querySelector('[data-action="password"]').addEventListener("click", openPasswordModal);
    document.getElementById("accountForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = formPayload(event.currentTarget);
      try {
        if (state.accountMode === "profile") {
          state.user = await api("/api/auth/profile", {
            method: "PUT",
            body: JSON.stringify({ fullName: payload.fullName })
          });
          document.getElementById("currentUser").textContent = state.user.fullName || state.user.username;
          document.getElementById("currentRole").textContent = `Vai trò: ${state.user.role}`;
          state.accountModal.hide();
          toast("Đã cập nhật thông tin cá nhân");
          if (state.route === "users") await route();
          return;
        }
        if (payload.newPassword !== payload.confirmPassword) {
          throw new Error("Mật khẩu mới nhập lại không khớp");
        }
        await api("/api/auth/password", {
          method: "PUT",
          body: JSON.stringify({
            currentPassword: payload.currentPassword,
            newPassword: payload.newPassword
          })
        });
        state.accountModal.hide();
        event.currentTarget.reset();
        toast("Đã đổi mật khẩu");
      } catch (error) {
        toast(error.message, "danger");
      }
    });
    document.getElementById("logoutBtn").addEventListener("click", async () => {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      location.href = "/";
    });
    window.addEventListener("hashchange", () => route().catch((error) => toast(error.message, "danger")));
    await route();
  } catch (error) {
    toast(error.message, "danger");
  }
}

boot();
