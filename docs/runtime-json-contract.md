# Runtime JSON Contract

This is the canonical JSON contract shared by ESP32 firmware and the server. MQTT messages that do not match this contract are rejected by the backend.

## Common Rules

- `deviceId` is the stable ESP32/bus runtime id and must match the `{device_id}` topic segment.
- `timestamp` is a Unix timestamp in seconds.
- Direction values are `FORWARD` and `BACKWARD`.
- Runtime/trip state values are `IDLE`, `RUNNING`, `PAUSED`, `STOPPED`, `ERROR` unless a specific schema says otherwise.
- MQTT never carries full route files. Route runtime files are downloaded over HTTP/HTTPS after an update notification.
- Backend JavaScript uses runtime validators in `src/contracts/runtimeJsonContract.js`. This repository does not use TypeScript, so no shared TypeScript interface is generated.

## Telemetry

Topic:

```text
bus/{device_id}/telemetry
```

Schema:

```json
{
  "deviceId": "BUS_01",
  "timestamp": 1716460000,
  "gps": {
    "lat": 21.0285,
    "lng": 105.8048,
    "speed": 32.5,
    "heading": 180,
    "sat": 11,
    "fix": true
  },
  "runtime": {
    "routeId": "01",
    "direction": "FORWARD",
    "currentStop": 5,
    "nextStop": 6,
    "tripState": "RUNNING"
  },
  "network": {
    "mqtt": true,
    "signal": 18
  }
}
```

Required fields:

- `deviceId`: string
- `timestamp`: integer Unix seconds
- `gps.lat`: number
- `gps.lng`: number
- `gps.speed`: number
- `gps.heading`: number
- `gps.sat`: integer
- `gps.fix`: boolean
- `runtime.routeId`: string
- `runtime.direction`: `FORWARD | BACKWARD`
- `runtime.currentStop`: integer
- `runtime.nextStop`: integer
- `runtime.tripState`: `IDLE | RUNNING | PAUSED | STOPPED | ERROR`
- `network.mqtt`: boolean
- `network.signal`: integer

## GPS-only update

Topic:

```text
bus/{device_id}/gps
```

Minimal payload:

```json
{
  "deviceId": "BUS_01",
  "timestamp": 1789992220,
  "lat": 21.0285,
  "lng": 105.8542,
  "speed": 18.5,
  "heading": 90,
  "sat": 8,
  "fix": true
}
```

The server also accepts the coordinates under `gps.lat` and `gps.lng`. `deviceId` may be omitted when the topic contains the device id.

## Status

Topic:

```text
bus/{device_id}/status
```

Schema:

```json
{
  "deviceId": "BUS_01",
  "uptime": 123456,
  "freeHeap": 182000,
  "sdReady": true,
  "queueDepth": 5,
  "runtimeState": "RUNNING",
  "routeVersion": "1.2"
}
```

Required fields:

- `deviceId`: string
- `uptime`: integer milliseconds or seconds, firmware must keep one unit consistently
- `freeHeap`: integer bytes
- `sdReady`: boolean
- `queueDepth`: integer
- `runtimeState`: `BOOTING | IDLE | RUNNING | PAUSED | STOPPED | ERROR`
- `routeVersion`: string

## Event

Topic:

```text
bus/{device_id}/event
```

Schema:

```json
{
  "type": "STOP_TRIGGERED",
  "timestamp": 1716460000,
  "routeId": "01",
  "stopCode": "BK01",
  "direction": "FORWARD"
}
```

Supported event types:

- `GPS_LOST`
- `MQTT_LOST`
- `MQTT_RESTORED`
- `ROUTE_RELOADED`
- `REVERSE_ROUTE`
- `STOP_TRIGGERED`
- `CRASH_RECOVERY`

Required fields:

- `type`: supported event type
- `timestamp`: integer Unix seconds
- `routeId`: string
- `direction`: `FORWARD | BACKWARD`
- `stopCode`: string when applicable

## Command

Topic:

```text
bus/{device_id}/cmd
```

Schema:

```json
{
  "cmd": "NEXT_STOP"
}
```

Or:

```json
{
  "cmd": "SET_ROUTE",
  "routeId": "02",
  "direction": "FORWARD"
}
```

Supported commands:

- `NEXT_STOP`
- `PREV_STOP`
- `SET_ROUTE`
- `RELOAD_ROUTE`
- `LOCK_TRIP`
- `UNLOCK_TRIP`

Required fields:

- `cmd`: supported command
- `routeId`: required for `SET_ROUTE`, optional string for other route-aware commands
- `direction`: optional `FORWARD | BACKWARD`

## Update Notification

Topic:

```text
bus/{device_id}/update
```

Schema:

```json
{
  "type": "ROUTE_UPDATE_AVAILABLE",
  "routeId": "01",
  "version": "1.3",
  "url": "https://server/routes/route_01.json",
  "checksum": "xxxxx"
}
```

Required fields:

- `type`: `ROUTE_UPDATE_AVAILABLE`
- `routeId`: string
- `version`: string
- `url`: string
- `checksum`: optional string

ESP32 update flow:

1. Receive update notification.
2. Download `url` over HTTP/HTTPS to a temp file on SD card.
3. Validate route file schema, version, and checksum when supplied.
4. Atomically rename temp file to the runtime file.
5. Reload runtime only after validation succeeds.

## Route Runtime File

Schema:

```json
{
  "routeId": "01",
  "version": "1.0",
  "up": [
    {
      "index": 1,
      "stopCode": "BK01",
      "name": "Bach Khoa",
      "lat": 21.005,
      "lng": 105.843,
      "terminal": true,
      "audio": "BK01"
    }
  ],
  "down": [],
  "updatedAt": 1716460000
}
```

Required fields:

- `routeId`: string
- `version`: string
- `up`: array of stops
- `down`: array of stops
- `updatedAt`: integer Unix seconds

Stop fields:

- `index`: integer, 1-based order in direction
- `stopCode`: string
- `name`: string
- `lat`: number
- `lng`: number
- `terminal`: boolean
- `audio`: string
