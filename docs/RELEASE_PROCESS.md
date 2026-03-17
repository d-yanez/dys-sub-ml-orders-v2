# Release Process

## Branching
- Rama principal: `main`.
- Commits atómicos con mensaje claro por alcance.

## Versioning
- Usar Semantic Versioning (`MAJOR.MINOR.PATCH`) en `package.json`.
- Registrar cambios funcionales y operativos en `docs/CHANGELOG.md`.
- Práctica: cada entrada publicada del changelog debe incluir fecha explícita (`YYYY-MM-DD`).

## Local verification
Antes de deploy:
1. `npm install`
2. `npm run dev`
3. Smoke básico (`GET /`, `POST /` inválido y válido)

## Build and deploy
- Pipeline definido en `cloudbuild.yaml`.
- Imagen: `gcr.io/$PROJECT_ID/dys-sub-ml-orders-v2:$SHORT_SHA`.
- Deploy Cloud Run en `us-central1`.

Comando manual de referencia:
```bash
gcloud builds submit --config cloudbuild.yaml .
```

## Post-deploy checks
1. Verificar revision activa en Cloud Run.
2. Revisar logs iniciales (`server_started`).
3. Validar recepción de evento real de Pub/Sub.
4. Confirmar comportamiento ACK esperado.
