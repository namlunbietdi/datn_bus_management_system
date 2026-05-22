# Hệ thống giám sát và điều phối xe buýt

Web quản lý, giám sát và điều phối xe buýt thông minh tại Hà Nội. Backend dùng Node.js, Express.js, MongoDB, Mongoose và MQTT client kết nối HiveMQ private cluster. Frontend dùng HTML, CSS, JavaScript thuần, Bootstrap 5.3, Bootstrap Icons và Leaflet cho bản đồ.

## Kiến trúc

- `src/server.js`: khởi động server.
- `src/app.js`: cấu hình Express, middleware, static files và API routes.
- `src/config/db.js`: kết nối MongoDB.
- `src/models`: User, Vehicle, VehicleType, Device, DeviceAssignment, Route, RouteDirection, Stop, Employee, DispatchOrder, LocationLog, DeviceLastState, DeviceEventLog, ActivityLog.
- `src/controllers`: logic API.
- `src/routes`: REST API routes.
- `src/services/mqttService.js`: telemetry, event và command MQTT nhẹ.
- `src/services/routeExportService.js`: export route JSON và manifest cho ESP32.
- `public`: giao diện Bootstrap.

## Cài đặt

```bash
npm install
```

Tạo file môi trường:

```bash
copy .env.example .env
```

Trên macOS/Linux:

```bash
cp .env.example .env
```

## Cấu hình `.env`

```env
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017/bus_monitoring
JWT_SECRET=change_me

MQTT_URL=mqtts://xxxxxxxx.s1.eu.hivemq.cloud:8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
MQTT_CLIENT_ID=bus-monitor-local

MQTT_TOPIC_TELEMETRY=bus/+/telemetry
MQTT_TOPIC_EVENT=bus/+/event
MQTT_TOPIC_COMMAND_PREFIX=bus

EXPORT_DIR=exports

ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ADMIN_FULL_NAME=System Admin
```

Không hardcode MongoDB URI, JWT secret hoặc HiveMQ credential trong code.

## Seed dữ liệu

Tạo admin mặc định:

```bash
npm run seed:admin
```

Tạo dữ liệu demo:

```bash
npm run seed
```

Tài khoản demo mặc định lấy từ `.env`:

- Username: `admin`
- Password: `admin123`

## Chạy ứng dụng

```bash
npm run dev
```

Truy cập:

```text
http://localhost:3000
```

## API chính

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/dashboard/summary`
- `GET /api/monitoring/vehicles`
- `GET /api/devices`
- `POST /api/devices/:deviceId/route-override`
- `POST /api/devices/:deviceId/route-version`
- `POST /api/devices/:deviceId/unlock-trip`
- `POST /api/devices/:deviceId/lock-trip`
- `GET /api/routes/export/:routeCode`
- `GET /api/routes/export/:routeCode?pretty=1`
- `GET /api/routes/export-all`

Response thống nhất:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "message": "..." }
```

## OFFLINE-FIRST ROUTE CONFIG

ESP32 không nhận route detail hoặc stop list qua MQTT. Route config được xuất thành JSON gọn để copy vào SD Card.

Quy trình cập nhật route cho ESP32:

1. Admin cập nhật tuyến và điểm dừng trên web.
2. Admin bấm `Export Route JSON` hoặc `Export All Routes`.
3. Hệ thống sinh file:
   - `route_DEMO01.json`
   - `route_DEMO02.json`
   - `manifest.json`
4. Copy các file JSON vào SD Card của ESP32.
5. ESP32 đọc route config từ SD Card khi khởi động.
6. Khi backend gửi `ROUTE_OVERRIDE`, ESP32 chỉ reload file tương ứng từ SD Card.
7. Backend không gửi route detail qua MQTT.

MQTT chỉ dùng cho:

- Telemetry: `bus/{deviceId}/telemetry`
- Event: `bus/{deviceId}/event`
- Command nhẹ: `bus/{deviceId}/command`

Các message đã loại bỏ khỏi kiến trúc:

- `ROUTE_MANIFEST` qua MQTT
- `ROUTE_DETAIL`
- `ROUTE_DETAIL_COMPACT`
- `ROUTE_ACTIVE_STOPS`
- stream danh sách điểm dừng realtime
- chia nhỏ payload route lớn
- retry route detail payload lớn

Kiến trúc này giảm RAM usage trên ESP32, giảm rủi ro crash module A7680C, ổn định hơn khi mất mạng và phù hợp triển khai embedded production.

## Route JSON cho ESP32

Ví dụ:

```json
{
  "version": 5,
  "routeCode": "DEMO02",
  "displayName": "DEMO 02",
  "outbound": [
    {
      "stopCode": "HBS0046",
      "name": "401 Co Nhue",
      "lat": 21.06692,
      "lon": 105.775834,
      "terminal": true,
      "audio": "HBS0046"
    }
  ],
  "inbound": []
}
```

File export không chứa Mongo ObjectId, `_id`, `__v`, timestamp, metadata hoặc field dư thừa.
