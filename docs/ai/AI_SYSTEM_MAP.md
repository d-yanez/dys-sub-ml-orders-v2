# AI System Map — dys-sub-ml-orders-v2

## Purpose
Procesar eventos `orders_v2` con resiliencia, trazabilidad e idempotencia.

## Core Areas

### 1) Ingreso HTTP Push
- Endpoint: `POST /`
- Envelope inválido -> `204` (ack para evitar reentregas infinitas)

### 2) Orquestación de procesamiento
- `ProcessMlOrderEventUseCase.execute(envelope)`
- Fases: ingest, idempotency, ml_order, ml_shipment, ml_item, stock, telegram, finalize

### 3) Idempotencia y concurrencia
- `eventOrderLogs` para dedupe por `orderId`
- `processingLocks` para lease lock por `orderId`

### 4) Integraciones externas
- ML Auth service (`order`, `item`, `shipment`)
- Stock API (`/api/stock/:sku`) con circuit breaker
- Telegram API

### 5) Persistencia
- `order` collection (upsert + enrichment)
- `eventOrderLogs` (fases/estado/error)
- `processingLocks` (lease)

## ACK contract
- `204`: éxito, duplicado, payload inválido o error no reintentable
- `500`: error transiente/retryable para reentrega Pub/Sub
