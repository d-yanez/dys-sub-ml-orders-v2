# Skill: ML Enrichment Pipeline

## Objetivo
Mantener pipeline de enriquecimiento consistente.

## Orden operativo
1. `getMlOrder`
2. `getMlShipment` (si hay shippingId)
3. `getMlItem` (si hay itemId)
4. persistencia (`upsertOrderDocument`, `updateOrderEnrichment`)

## Regla
Errores en shipment pueden cortar con 500; item puede degradar con warning.
