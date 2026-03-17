# AI Context - dys-sub-ml-orders-v2

## Propósito
Consumidor Push HTTP de eventos Mercado Libre (`orders_v2`) para:
- persistir/actualizar orden en Mongo
- enriquecer con datos ML + stock
- enviar notificación Telegram

## Stack real
- Node.js 20 + Express
- MongoDB
- Winston logging estructurado
- Deploy Cloud Run

## Flujo principal
`POST /` (Push Pub/Sub) -> parse envelope -> idempotencia + lease lock -> enriquecimiento (order/shipment/item/stock) -> Telegram -> ACK.

## Archivos ancla
- `src/app.js`
- `src/useCases/ProcessMlOrderEventUseCase.js`
- `src/repositories/*`
- `src/services/*`
- `src/utils/http.js`, `src/utils/errorCatalog.js`
