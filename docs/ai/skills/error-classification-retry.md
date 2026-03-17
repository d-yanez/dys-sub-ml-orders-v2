# Skill: Error Classification + Retry

## Objetivo
Clasificar errores correctamente para decidir retry (500) o ack final (204).

## Punto clave
`classifyDependencyError` define:
- `errorCode`
- `retryable`
- `ackStatus`

## Regla
Si se cambia catálogo de errores, validar impacto en redelivery.
