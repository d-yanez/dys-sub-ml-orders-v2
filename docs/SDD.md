# SDD (Spec-Driven Development)

## Objetivo
Definir cambios de forma explícita antes de implementar, reduciendo regresiones en un flujo event-driven.

## Flujo recomendado
1. **Spec breve**
   - problema actual
   - comportamiento esperado
   - impacto en ACK (`204/500`)
   - impacto en idempotencia/locks
2. **Análisis técnico**
   - archivos a tocar
   - riesgos y mitigaciones
3. **Implementación mínima**
4. **Smoke test**
5. **Documentación y changelog**

## Template de spec (mínimo)
- Contexto
- Requisitos funcionales
- Requisitos no funcionales (resiliencia/observabilidad)
- Contrato de entrada/salida
- Casos de error
- Plan de validación

## Reglas clave del proyecto
- No romper contrato Push ACK.
- No eliminar trazabilidad por `traceId`.
- No alterar idempotencia sin plan de migración.
