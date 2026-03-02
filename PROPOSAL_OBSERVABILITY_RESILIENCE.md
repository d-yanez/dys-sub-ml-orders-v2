# Propuesta: Observabilidad + Resiliencia (sin implementacion)

## 1) Estado actual (hallazgos del servicio)

Base analizada:
- `src/useCases/ProcessMlOrderEventUseCase.js`
- `src/utils/http.js`
- `src/services/mlService.js`
- `src/services/stockService.js`
- `src/services/telegramMessageBuilder.js`
- `src/infrastructure/telegramClient.js`
- `src/repositories/eventOrderLogsRepository.js`
- `src/infrastructure/mongoClient.js`
- `src/infrastructure/logger.js`

### Lo que ya esta bien
- Existe `traceId` (desde atributos Pub/Sub o UUID generado): `ProcessMlOrderEventUseCase.js:104`.
- Hay logs estructurados JSON con Winston: `infrastructure/logger.js`.
- Ya hay timeout + retry + backoff en HTTP client compartido: `utils/http.js:27-105`.
- Ya se persiste estado final con `warning` y tiempos: `eventOrderLogsRepository.js:31-47`.

### Gaps detectados para el caso PARTIAL_SUCCESS/aborted
- Esquema de logs inconsistente (campos varian por evento, p.ej. `elapsed_ms_stock` vs otros).
- No existe wrapper de logging con contexto fijo (`service/env/messageId/orderId/traceId`).
- No existe `errorCode` normalizado; hoy se usa `error` string libre.
- Telegram no incluye `TraceId` en mensaje de orden ni mensaje de error.
- Idempotencia actual en Mongo esta por `orderId` (no por `messageId`), puede ocultar reintentos reales de Pub/Sub.
- `eventOrderLogs` guarda estado final, pero no un `phases[]` completo por ejecucion.
- Retry existe, pero no hay budget total del proceso, ni circuit breaker para stock/ML, ni clasificacion uniforme de transientes/permanentes.

## 2) Estandar de logging estructurado

## 2.1 Log schema obligatorio (todos los logs)

Definir un schema base comun:

```json
{
  "service": "dys-sub-ml-orders-v2",
  "env": "prd",
  "message": {
    "event": "phase_stock_lookup_done",
    "traceId": "6638a72f-7cf7-492f-8058-6669a7355abd",
    "orderId": "2000015358303236",
    "packId": "123456789",
    "messageId": "10568319530110640",
    "phase": "stock",
    "attempt": 1,
    "attempts": 3,
    "elapsedMs": 482,
    "elapsedTotalMs": 1520,
    "status": "PARTIAL_SUCCESS",
    "errorCode": "ABORTED_STOCK",
    "errorSummary": "Stock lookup aborted after timeout budget",
    "errorDetails": "This operation was aborted",
    "warning": "Stock unavailable"
  }
}
```

Convenciones:
- `event`: nombre estable y versionable.
- `phase`: enum fijo: `ingest | idempotency | ml_order | ml_item | stock | telegram | persist_order | finalize`.
- `status`: `SUCCESS | PARTIAL_SUCCESS | ERROR`.
- `errorCode`: catalogo cerrado (ver seccion 5).
- `errorDetails`: campo opcional para raw error del proveedor.
- `errorSummary`: max 180 chars.
- `elapsedMs`: duracion de la fase del log.
- `elapsedTotalMs`: reloj de ejecucion completo.
- `traceId` oficial para busqueda en GCP: `jsonPayload.message.traceId`.

## 2.2 Wrapper de logger (propuesto)

Agregar helper central:
- `src/infrastructure/logContext.js` (nuevo)
- `src/infrastructure/logger.js` (adaptar)

Interfaz propuesta:
- `createLogContext({ traceId, orderId, packId, messageId, service, env })`
- `const log = createLogger(ctx)`
- `log.info({ event, phase, ... })`
- `log.warn({ event, phase, ... })`
- `log.error({ event, phase, errorCode, errorSummary, ... })`

Reglas:
- El wrapper inyecta siempre: `service`, `env` y `message.traceId`, `message.orderId`, `message.packId`, `message.messageId`.
- Estructura obligatoria por log:

```json
{
  "service": "dys-sub-ml-orders-v2",
  "env": "prd",
  "message": {
    "traceId": "...",
    "orderId": "...",
    "packId": "...",
    "messageId": "...",
    "phase": "...",
    "event": "..."
  }
}
```

- El wrapper agrega `elapsedTotalMs` automaticamente si recibe `startedAt`.
- Evitar logs raw sin contexto desde use cases o clients.

## 2.3 Severity estandar

- `INFO`: inicio/fin de fase y resultados esperados.
- `WARNING`: degradaciones recuperables (`stock` vacio, fallback usado, breaker abierto).
- `ERROR`: fallas reales que afectan consistencia o disponibilidad del resultado esperado.

## 2.4 Lista de eventos estandar (sugerida)

- `phase_received_event`
- `phase_payload_parse_failed`
- `phase_idempotency_started`
- `phase_idempotency_done`
- `phase_idempotency_duplicate`
- `phase_ml_order_started`
- `phase_ml_order_done`
- `phase_ml_item_started`
- `phase_ml_item_done`
- `phase_stock_lookup_started`
- `phase_stock_lookup_done`
- `phase_stock_lookup_fallback_done`
- `phase_stock_lookup_degraded`
- `phase_telegram_started`
- `phase_telegram_done`
- `phase_persist_order_done`
- `phase_event_log_updated`
- `phase_finalize_done`
- `phase_processing_failed`
- `pubsub_ack_sent`

## 3) Telegram: TraceId copiable y util

## 3.1 Formato propuesto (orden normal)

Actualizar builder actual en `src/services/telegramMessageBuilder.js` para incluir:
- `TraceId` en linea propia, en `<code>`.
- `orderId` y `packId` cerca del inicio.
- linea de busqueda rapida textual.
- El valor debe ser exactamente el persistido en `message.traceId` del log.

Plantilla:

```text
🛒 Nueva orden ML
OrderId: <code>2000015358303236</code>
PackId: <code>...</code>
SKU: <code>...</code>
⚠️ Stock: no encontrado
TraceId: <code>6638a72f-7cf7-492f-8058-6669a7355abd</code>
🔎 Buscar en GCP: traceId=6638a72f-7cf7-492f-8058-6669a7355abd
```

## 3.2 UX mobile (1 toque)

Opcional recomendado en `src/infrastructure/telegramClient.js`:
- agregar `reply_markup.inline_keyboard` con boton:
  - `text: "Copiar traceId"`
  - `switch_inline_query_current_chat: "6638a72f-7cf7-492f-8058-6669a7355abd"`

Nota:
- En Telegram no existe boton nativo "copy to clipboard" universal en bots; la opcion mas robusta es mantener `TraceId` como `<code>` en linea separada + boton inline de autocompletado para reutilizar texto.

## 3.3 Mensaje de error tambien con trace

Actualizar `buildErrorTelegramHtml` para incluir:
- `TraceId`
- `OrderId`
- `Phase`
- `ErrorCode`
- `ErrorSummary` corto

## 4) Persistencia de debugging (Mongo)

## 4.1 Modelo Run/Event log por ejecucion

Evolucionar `eventOrderLogs` de "estado final por orderId" a "run por messageId/traceId":

Documento sugerido:

```json
{
  "traceId": "6638a72f-7cf7-492f-8058-6669a7355abd",
  "orderId": "2000015358303236",
  "packId": "123",
  "messageId": "10568319530110640",
  "service": "dys-sub-ml-orders-v2",
  "env": "prd",
  "status": "PARTIAL_SUCCESS",
  "warning": "Stock unavailable: This operation was aborted",
  "errorCode": null,
  "errorSummary": null,
  "phases": [
    {
      "phase": "ml_order",
      "attempts": 1,
      "elapsedMs": 321,
      "result": "SUCCESS",
      "errorCode": null,
      "errorSummary": null,
      "at": "2026-03-02T14:10:03.000Z"
    }
  ],
  "createdAt": "2026-03-02T14:10:02.000Z",
  "updatedAt": "2026-03-02T14:10:05.000Z"
}
```

## 4.2 Indices sugeridos

Sobre `eventOrderLogs`:
- `traceId` index
- `orderId` index
- `messageId` unique index (idempotencia fuerte por entrega Pub/Sub)
- `createdAt` TTL index (30-90 dias)

Complemento:
- Si se mantiene documento agregado por `orderId`, separar coleccion:
  - `eventOrderRuns` (por ejecucion)
  - `orderProcessingState` (estado resumido por orden)

## 5) Resiliencia por dependencia (politica propuesta)

## 5.1 Catalogo de errorCode normalizado

Comunes:
- `TIMEOUT_*`
- `HTTP_429_*`
- `HTTP_5XX_*`
- `NETWORK_*`
- `ABORTED_*`
- `INVALID_PAYLOAD_*`
- `MONGO_*`
- `TELEGRAM_*`

Ejemplos:
- `TIMEOUT_ML_ORDER`
- `HTTP_503_STOCK`
- `ABORTED_STOCK`
- `MONGO_WRITE_FAILED`

Regla para aborted:
- Si llega `"This operation was aborted"` durante stock lookup, normalizar a `ABORTED_STOCK` (o `TIMEOUT_STOCK` si lo mapean por timeout interno).
- Conservar texto raw del proveedor en `errorDetails` opcional.

## 5.2 Timeouts explicitos por dependencia

Mantener variables por dependencia en `src/config/env.js` y agregar budget:
- `ML_ORDER`: 2500-3000ms
- `ML_ITEM`: 2000-2500ms
- `STOCK`: 1500-2500ms
- `MONGO`: server selection 5000ms (ya existe), agregar timeout operacional por query critica
- `TELEGRAM`: 5000ms actual, parametrizable
- `PROCESS_TOTAL_BUDGET_MS`: nuevo (ej. 9000-12000ms)

Regla:
- Ningun retry puede sobrepasar `PROCESS_TOTAL_BUDGET_MS`.

## 5.3 Retry + backoff + jitter (solo transientes)

Sobre `src/utils/http.js`:
- Mantener retry para:
  - HTTP `429`
  - HTTP `5xx`
  - `AbortError`
  - errores de red (`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, etc.)
- No reintentar `4xx` de negocio (`400/401/403/404`), salvo `409` si se define transiente.
- Parametros sugeridos:
  - `maxRetries`: 2 o 3 (ademas del intento inicial)
  - `backoff`: 200ms, 500ms, 1200ms + jitter
  - respetar `Retry-After` cuando venga

## 5.4 Circuit breaker (opcional recomendado)

Dependencias candidatas:
- `stock` (prioridad alta)
- `mlAuth` (opcional)

Politica sugerida:
- abrir con `>=5` fallos transientes en ventana de `30s`.
- `openDurationMs`: `20-30s`.
- `halfOpen`: 1 request de prueba.
- si falla en half-open -> vuelve a open.
- fallback en open:
  - no llamar dependencia
  - log `WARNING` `phase_stock_lookup_degraded`
  - `status` final `PARTIAL_SUCCESS`
  - Telegram: "Stock lookup degraded (circuit open)".

## 5.5 Fallback de stock

Si stock falla:
- marcar fase `stock` como `FAILED_TRANSIENT` o `SKIPPED_CIRCUIT_OPEN`.
- persistir `errorCode`/`errorSummary`.
- no bloquear todo el flujo si negocio lo permite.
- mantener `PARTIAL_SUCCESS` + Telegram claro.

## 5.6 Politica de reproceso (opcional)

Si stock es critico:
- publicar a topico `stock_retry` con mismo `traceId`, `orderId`, `messageId`, `attempt`.
- delay escalonado (ej. 30s / 2m / 10m).
- maximo de reintentos y `dead-letter`.

## 6) Archivos a tocar (cuando se implemente)

Cambios directos en este servicio:
- `src/infrastructure/logger.js`
- `src/app.js`
- `src/useCases/ProcessMlOrderEventUseCase.js`
- `src/utils/http.js`
- `src/services/mlService.js`
- `src/services/stockService.js`
- `src/services/telegramMessageBuilder.js`
- `src/infrastructure/telegramClient.js`
- `src/repositories/eventOrderLogsRepository.js`
- `src/infrastructure/mongoClient.js`
- `src/config/env.js`

Nuevos sugeridos:
- `src/infrastructure/logContext.js`
- `src/utils/errorCatalog.js`
- `src/utils/circuitBreaker.js` (si se implementa breaker interno)

## 7) Estructura de ctx sugerida

```js
const ctx = {
  traceId,
  orderId,
  packId,
  messageId,
  service: 'dys-sub-ml-orders-v2',
  env: process.env.NODE_ENV || 'dev',
  startedAt: Date.now(),
  phases: []
};
```

Cada fase agrega en `ctx.phases`:
- `phase`
- `startedAt`
- `endedAt`
- `elapsedMs`
- `attempt`
- `attempts`
- `result`
- `errorCode`
- `errorSummary`

## 8) Cloud Logging queries listas

Por `traceId`:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="dys-sub-ml-orders-v2"
jsonPayload.message.traceId="6638a72f-7cf7-492f-8058-6669a7355abd"
```

Por `orderId`:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="dys-sub-ml-orders-v2"
jsonPayload.message.orderId="2000015358303236"
```

Por `messageId`:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="dys-sub-ml-orders-v2"
jsonPayload.message.messageId="10568319530110640"
```

Solo errores reales:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="dys-sub-ml-orders-v2"
severity=ERROR
```

Solo degradaciones de stock:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="dys-sub-ml-orders-v2"
jsonPayload.message.phase="stock"
jsonPayload.message.status="PARTIAL_SUCCESS"
```

Warnings con aborted:

```text
resource.type="cloud_run_revision"
resource.labels.service_name="dys-sub-ml-orders-v2"
severity=WARNING
jsonPayload.message.errorCode="ABORTED_STOCK"
```

## 9) Estandar transversal para otros servicios del ecosistema

Para replicar rapido en otros microservicios:
- Publicar paquete interno compartido (o carpeta comun) con:
  - `createLogger(ctx)`
  - `requestWithResilience(...)`
  - `errorCatalog`
  - `buildTelegramTraceBlock(...)`
- Definir contrato minimo obligatorio por servicio:
  - campos de log obligatorios
  - error codes comunes
  - severidad por tipo de evento
  - politicas de retry/timeout por dependencia
- Checklist de adopcion por servicio:
  - [ ] logs con schema unico
  - [ ] traceId en Telegram
  - [ ] run log por messageId
  - [ ] queries de observabilidad documentadas

## 10) Priorizacion de implementacion (recomendada)

1. Logging wrapper + schema fijo + severity.
2. TraceId visible/copiable en Telegram.
3. Run log `phases[]` + indices Mongo (`traceId`, `orderId`, `messageId` unique, TTL).
4. Error catalog + clasificacion transiente/permanente.
5. Budget total y endurecimiento de retry.
6. Circuit breaker de stock.
7. Reproceso asincrono de stock (si negocio lo requiere).

---

Resumen del caso real:
- El `PARTIAL_SUCCESS` con warning `Stock unavailable: This operation was aborted` es consistente con una falla transiente de lookup stock.
- Con esta propuesta, ese caso quedaria inmediatamente trazable por `jsonPayload.message.traceId` en Cloud Logging y por el mismo valor en Telegram, con degradacion controlada/explicita en logs y Mongo sin perder contexto de ejecucion.
