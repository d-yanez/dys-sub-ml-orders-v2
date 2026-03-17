# Project Memory

Decisiones persistentes del proyecto.

## ACK de Pub/Sub
- Nunca cambiar `ackStatus` sin análisis de impacto.
- `500` solo para fallas transientes/retryables.

## Idempotencia
- Se usa `orderId` como clave operativa para dedupe y lock.
- No romper `registerOrderProcessing` ni `acquireLease` al refactorizar.

## Stock
- La consulta intenta `sku` y puede caer a `skuVariant`.
- Circuit breaker protege dependencia de stock.

## Enriquecimiento ML item
- Se persiste `user_product_id` en `order` desde respuesta de item.
- Regla de seguridad: solo se guarda si viene string no vacío (trimmed).
- Si no viene valor válido, no se sobrescribe el campo existente.

## Documentación del servicio
- Se mantiene documentación técnica humana en `docs/`.
- Se mantiene contexto operativo IA en `docs/ai/` para no depender del chat previo.

## Telegram
- Envío protegido por claim (`claimTelegramSend`) para evitar duplicados.

## Estrategia de cambio
- cambios pequeños, reversibles y con smoke local.
