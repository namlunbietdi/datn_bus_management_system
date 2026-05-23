# Offline-First Data Flow

This document is the contract between ESP32 firmware and the bus management server.

## Runtime Ownership

ESP32 owns:
- Active runtime route loaded from SD card.
- Stop detection, direction logic, audio trigger logic, local recovery.
- Offline event queue and runtime state.
- Atomic file update flow: download temp file, validate, rename, reload.

Server owns:
- Route and stop authoring data.
- Exported route/config files for device download.
- Telemetry/event/status storage for monitoring and analytics.
- Remote command publishing and update notification.
- OTA/update management metadata.

The server stores `DeviceLastState` only as a mirror of the latest ESP32 report. It must not be treated as the source of truth for route execution.

## MQTT Topics

All MQTT topics use this structure:

```text
bus/{device_id}/telemetry
bus/{device_id}/event
bus/{device_id}/status
bus/{device_id}/cmd
bus/{device_id}/update
```

MQTT must not carry full route/runtime files. It only carries telemetry, event, status, command, and update notifications.

## Canonical JSON Contract

The canonical payload and route-file schemas are maintained in `docs/runtime-json-contract.md`.

Use that document for:
- Telemetry payload
- Status payload
- Event payload
- Command payload
- Update notification payload
- Route runtime file payload

The ESP32 should queue events offline and publish them after reconnect.

## Runtime HTTP Endpoints

The server exposes device download endpoints:

```text
GET /api/runtime/manifest
GET /api/runtime/routes/{routeId}
```

If `DEVICE_UPDATE_TOKEN` is configured, ESP32 must pass it via `x-device-token` or `Authorization: Bearer`.

ESP32 update flow:
1. Receive update notification.
2. Download the file over HTTP/HTTPS to a temp file on SD card.
3. Validate schema/version/checksum if supplied.
4. Atomically rename temp file to runtime file.
5. Reload runtime only after the file is valid.
