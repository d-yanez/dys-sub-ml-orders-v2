# Skill: Idempotency + Lock Flow

## Objetivo
Evitar procesamiento duplicado y carreras por `orderId`.

## Componentes
- `registerOrderProcessing` en `eventOrderLogs`.
- `acquireLease` en `processingLocks`.

## Regla
No cambiar clave de dedupe/lock sin plan de migración.
