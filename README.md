# dys-sub-ml-orders-v2

Microservicio consumidor de eventos de Mercado Libre (orders_v2) mediante Pub/Sub con patrón Push HTTP. Está diseñado para ejecutarse en Cloud Run y procesar mensajes entrantes con logging estructurado y trazabilidad por `traceId`.

El proyecto replica la estructura y estilo de `dys-bsale-notify-web-order`, manteniendo un runtime Node.js 20 y una arquitectura clean-ish por capas con responsabilidades claras.

## Arquitectura

Este servicio recibe eventos desde una suscripción Push de Pub/Sub y responde siempre `204 No Content` para confirmar el ACK.

Flujo:

```
Publisher → Topic → Subscription (Push) → Cloud Run (POST /)
```

ACK:
- Pub/Sub considera el mensaje procesado cuando el endpoint responde HTTP 204.

## Estructura del proyecto

```
dys-sub-ml-orders-v2/
  src/
    app.js
    domain/
    useCases/
      ProcessMlOrderEventUseCase.js
    infrastructure/
      logger.js
  Dockerfile
  cloudbuild.yaml
  package.json
```

- `src/app.js`: servidor Express y endpoint `POST /` para recibir mensajes Push.
- `src/useCases/ProcessMlOrderEventUseCase.js`: decodifica y procesa el envelope Pub/Sub.
- `src/infrastructure/logger.js`: logger Winston con formato JSON.
- `src/domain/`: reservado para entidades/contratos de dominio.
- `Dockerfile`, `cloudbuild.yaml`, `package.json`: build, deploy y configuración runtime.

## Variables de entorno

- `LOG_LEVEL`: nivel de logging (`info`, `debug`, etc.).
- `PORT`: puerto de escucha HTTP (default 8080 en Cloud Run).
- `SUBSCRIPTION_NAME`: nombre de la suscripción, usado para trazabilidad en logs.

## Ejecución local

Instala dependencias y levanta el servicio:

```bash
npm install
npm run dev
```

Simula un push de Pub/Sub con `curl` (el `data` va en base64):

```bash
curl -X POST http://localhost:8080/ \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "messageId": "ml-evt-001",
      "publishTime": "2026-02-27T01:35:14.268Z",
      "attributes": {
        "traceId": "trace-ml-001"
      },
      "data": "eyJ0b3BpYyI6ICJvcmRlcnNfdjIiLCAicmVzb3VyY2UiOiAiL29yZGVycy8yMDAwMDE1MzE0MDk2MDEwIiwgInVzZXJfaWQiOiAxMjQ0ODI0MzUyfQ=="
    },
    "subscription": "sub-ml-orders_v2"
  }'
```

El `data` anterior corresponde a:

```json
{
  "topic": "orders_v2",
  "resource": "/orders/2000015314096010",
  "user_id": 1244824352
}
```

## Deploy en Cloud Run

- El deploy está automatizado con Cloud Build (`cloudbuild.yaml`).
- Se construye la imagen con Docker y se despliega en Cloud Run.
- Debes crear una suscripción Push que apunte al endpoint `POST /` del servicio:
  - `--push-endpoint=https://<SERVICE>.run.app/`
  - `--push-auth-service-account=<SA>`

## Seguridad

- Usa una service account dedicada para Pub/Sub Push.
- Otorga solo el rol `roles/run.invoker` al servicio Cloud Run.
- Aplica el principio de least privilege para minimizar permisos.

## Logging y traceId

- El `traceId` se toma desde `attributes.traceId` si existe.
- Si no viene, se genera un UUID.
- Se loguea información estructurada: `subscription`, `messageId`, `publishTime`, `traceId`, `attributes`, `payload`.
- Esto facilita correlación y trazabilidad en arquitecturas event-driven.

## Roadmap futuro

- Idempotencia en el procesamiento de eventos.
- Dead Letter Topics (DLQ) para mensajes fallidos.
- Validación de schema (ej: JSON Schema).
- Integración con otros dominios o servicios internos.
