# Skill: Stock Fallback + Circuit

## Objetivo
Entregar stock útil con resiliencia.

## Reglas
- Lookup primario por `sku`.
- Si vacío o falla, intentar `skuVariant` cuando exista.
- Usar circuit breaker para proteger dependencia de stock.

## No romper
- `stockStatusText` y warnings de degradación.
