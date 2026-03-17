# Engineering Practices

## Development principles
- Cambios pequeños y reversibles.
- Mantener semántica de ACK de Pub/Sub.
- No mezclar responsabilidades entre `app`, `useCases`, `services` y `repositories`.

## Coding standards
- Mantener logs estructurados con `traceId`, `messageId`, `orderId` cuando aplique.
- Reutilizar `requestJsonWithRetry` para llamadas HTTP externas.
- Clasificar errores con `errorCatalog` antes de decidir `ackStatus`.
- Registrar cambios en `docs/CHANGELOG.md` con fecha explícita (`YYYY-MM-DD`).

## Data and idempotency
- Preservar idempotencia por `orderId` en `eventOrderLogs`.
- Preservar lock de proceso en `processingLocks`.
- No cambiar claves de dedupe/lock sin migración explícita.

## Operational safety checklist (before merge)
1. Validar `GET /` local.
2. Probar `POST /` con envelope inválido (esperado: `204`).
3. Probar `POST /` con payload válido.
4. Confirmar logs por fase y `traceId`.
5. Revisar que cambios de env estén documentados.

## Observability
- Mantener eventos por fase en `eventOrderLogs.phases`.
- Evitar mensajes de error ambiguos: usar `errorCode` + `errorSummary`.
