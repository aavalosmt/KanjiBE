# KanjiBE

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

## Hosting (Railway)

El build de Prisma ya no exige `DATABASE_URL` en tiempo de imagen. Aun así, en **Variables** del servicio pon:

| Variable | Valor |
| --- | --- |
| `ADMIN_API_KEY` | un secreto tuyo |
| `PUBLIC_BASE_URL` | la URL que te da Railway, sin slash final |
| `DATABASE_URL` | `file:/app/data/kanji.db` |
| `UPLOAD_DIR` | `/app/data/uploads` |

Railway asigna `PORT` solo. En Settings genera un dominio público (el servicio sale como *Unexposed* hasta que lo hagas). Monta un Volume en `/app/data` si no quieres perder la DB en cada deploy.

Detalle: [`docs/implementacion-y-deploy.md`](docs/implementacion-y-deploy.md).

## Tests

```bash
npx prisma generate
npm test
```
