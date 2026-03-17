# Skill: Pub/Sub ACK Contract

## Objetivo
Modificar el procesamiento sin romper comportamiento de redelivery de Pub/Sub.

## Regla
- `204`: confirmar mensaje (éxito, duplicado, inválido, no-retryable).
- `500`: solicitar redelivery en errores transientes.

## Validación mínima
Simular `POST /` y verificar `ackStatus` esperado por tipo de error.
