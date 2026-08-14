# KanjiBE
<<<<<<< HEAD
The backend for KanjiPro app
=======

API REST de Node.js para el lector interactivo de historias y letras (japonés). El texto tokenizado con furigana se guarda tal cual; el alineado ruby es responsabilidad del cliente iOS.

- Spec: [`docs/spec.md`](docs/spec.md)
- Estado de la implementación y plan de deploy: [`docs/implementacion-y-deploy.md`](docs/implementacion-y-deploy.md)

## Requisitos

- Node.js 20.19+ (`nvm use` lee `.nvmrc`)
- SQLite (incluido, no hay que instalar nada más)

## Arranque local

```bash
nvm use
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npm run dev
```

El servidor queda en `http://localhost:3000`.

Panel CRUD: [http://localhost:3000/admin/](http://localhost:3000/admin/)  
Admin key de desarrollo: `dev-admin-key` (cámbiala en `.env` antes de subir a hosting).

## Endpoints públicos (iOS)

- `GET /api/stories?page=1&limit=20&level=N3`
- `GET /api/stories/:id`
- `GET /api/lyrics?page=1&limit=20`
- `GET /api/lyrics/:id`
- `GET /health`

Las listas no incluyen `blocks`. El detalle sí, con traducciones y en el orden guardado.

## Endpoints admin

Protegidos con `X-Admin-Key: <ADMIN_API_KEY>` o `Authorization: Bearer <ADMIN_API_KEY>`.

- `POST /api/admin/stories`
- `PUT /api/admin/stories/:id`
- `DELETE /api/admin/stories/:id`
- `POST /api/admin/lyrics`
- `PUT /api/admin/lyrics/:id`
- `DELETE /api/admin/lyrics/:id`
- `POST /api/admin/upload` — `multipart/form-data` con campo `file` o `image`

Ejemplo:

```bash
curl -X POST http://localhost:3000/api/admin/stories \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: dev-admin-key" \
  -d @- <<'JSON'
{
  "title": "本文",
  "level": "N3",
  "translation": "Texto Principal",
  "blocks": [
    {
      "type": "text",
      "content": "[家族](furigana:か.ぞく)",
      "translation": "Familia"
    }
  ]
}
JSON
```

## Hosting

La app lee todo de env (`PORT`, `DATABASE_URL`, `ADMIN_API_KEY`, `PUBLIC_BASE_URL`, `CORS_ORIGIN`, `UPLOAD_DIR`).

```bash
docker compose up --build
```

Notas para cuando lo subas:

- En un VPS o un plan con disco persistente, SQLite + el volumen de `uploads` es suficiente.
- En hosting efímero (Render/Railway sin volume) cambia `DATABASE_URL` a Postgres y `provider` en `prisma/schema.prisma` a `postgresql`. Las imágenes conviene moverlas a un bucket después.
- Pon `PUBLIC_BASE_URL` con la URL pública para que `/api/admin/upload` devuelva URLs absolutas.

## Tests

```bash
npx prisma generate
npm test
```
>>>>>>> 5602165 (Initial setup)
