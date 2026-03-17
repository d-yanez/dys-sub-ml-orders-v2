# Working Rules

## Must keep
- No romper contrato Push HTTP (`POST /` + semántica ACK).
- Mantener trazabilidad (`traceId`, `messageId`, fases).
- Mantener separación app/useCase/repositories/services/utils.

## Safe changes
- Si tocas clasificación de errores, revalidar `ackStatus` resultante.
- Si tocas repositorios, validar idempotencia + lock.
- Si tocas stock, validar fallback y circuit breaker.

## Smoke mínimo
1. `GET /` responde "is up"
2. `POST /` con envelope inválido -> 204
3. `POST /` con evento válido -> 204 o 500 según dependencia
4. Verificar logs de fase y `traceId`
