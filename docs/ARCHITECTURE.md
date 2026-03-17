# Architecture

## Summary
`dys-sub-ml-orders-v2` es un consumidor Push HTTP de Pub/Sub desplegado en Cloud Run.
Procesa eventos de Mercado Libre (`orders_v2`) y ejecuta pipeline de enriquecimiento + notificación.

## Runtime and deployment
- Runtime: Node.js 20
- Framework: Express
- Deploy: Cloud Run vía Cloud Build
- Endpoint de ingreso: `POST /`

## Logical components
- `src/app.js`
  - HTTP entrypoint.
  - Construye contexto de logs.
  - Envía ACK HTTP según resultado del use case.
- `src/useCases/ProcessMlOrderEventUseCase.js`
  - Orquestación completa por fases.
- `src/services/*`
  - Integración ML (`mlService`), stock (`stockService`), builders Telegram.
- `src/repositories/*`
  - Persistencia de estado/eventos (`eventOrderLogs`, `order`) y locks (`processingLocks`).
- `src/utils/*`
  - HTTP con retry/backoff/budget y catálogo de errores.

## Processing flow
1. Recibe envelope Push de Pub/Sub.
2. Decodifica payload y obtiene `orderId`.
3. Adquiere lock de procesamiento por `orderId`.
4. Registra idempotencia en `eventOrderLogs`.
5. Consulta ML order, shipment e item.
6. Persiste/actualiza documento de orden.
7. Consulta stock por `sku` con fallback a `skuVariant`.
8. Envía notificación Telegram con control de claim (single-send).
9. Actualiza estado final y fases en `eventOrderLogs`.
10. Responde ACK HTTP (`204` o `500`).

## ACK semantics
- `204`: mensaje confirmado (éxito, duplicado, inválido o no-retryable).
- `500`: error transiente para forzar redelivery de Pub/Sub.

## External dependencies
- MongoDB
- ML auth service (`ML_AUTH_BASE_URL`)
- Stock API (`STOCK_BASE_URL`)
- Telegram Bot API

## Key resilience controls
- Retries por dependencia (`RETRY_MAX_ATTEMPTS_*`).
- Timeout por dependencia (`HTTP_TIMEOUT_MS_*`).
- Budget total del proceso (`PROCESS_TOTAL_BUDGET_MS`).
- Circuit breaker para stock (`STOCK_CIRCUIT_*`).
- Lease lock para evitar carreras de procesamiento.
