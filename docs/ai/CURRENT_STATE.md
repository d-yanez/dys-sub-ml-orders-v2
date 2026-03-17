# Current State

## Version
- `1.0.0`

## Estado funcional
- Endpoint `POST /` operativo para Pub/Sub push.
- Idempotencia por `eventOrderLogs` + lock de proceso por `processingLocks`.
- Enriquecimiento de orden con ML order/shipment/item.
- En fase `ml_item`, se persiste `user_product_id` cuando ML item lo entrega con valor válido.
- Lookup de stock con fallback `sku -> skuVariant`.
- Circuit breaker de stock activo.
- Telegram con claim para envío único.

## Documentación disponible
- `docs/` contiene base técnica para humanos (arquitectura, prácticas, release, SDD, changelog).
- `docs/ai/` contiene contexto persistente operativo para IA (mapa, memoria, skills).

## Reglas críticas actuales
- `ACK 204` en casos no reintentables.
- `ACK 500` en fallas transientes (para redelivery).
- `processTotalBudgetMs` limita tiempo total de dependencias externas.

## Pendiente explícito (README)
- pruebas automáticas
- DLQ
- validación formal de schema
