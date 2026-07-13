# bookingCalendar

Short-term rental operations and cleaning management platform built with Next.js 15, Prisma, PostgreSQL, and Docker.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, FullCalendar, TanStack Query
- **Backend**: Next.js Route Handlers, Prisma ORM, PostgreSQL
- **Auth**: JWT (access + refresh tokens), HTTP-only cookies, role-based access control
- **Architecture**: Repository pattern → Service layer → API routes

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) & Docker Compose (for containerized setup)
- PostgreSQL (for local setup without Docker)

### Option 1: Docker (Recommended)

This is the easiest way to run the full stack.

```bash
# 1. Start PostgreSQL and the app
#    Database migrations are applied automatically on app startup.
docker compose up -d

# 2. (First run only) Seed the initial super admin account manually
docker compose exec app node prisma/seed.mjs

# 3. Open http://localhost:3000
```

To stop:

```bash
docker compose down
```

To reset the database:

```bash
docker compose down -v
docker compose up -d
# Re-seed after a reset
docker compose exec app node prisma/seed.mjs
```

### Option 2: Local Development

Requires a running PostgreSQL instance on `localhost:5432`.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your PostgreSQL credentials

# 3. Create the database and run migrations
npx prisma migrate dev

# 4. Seed demo data
npm run db:seed

# 5. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Database Commands

```bash
npx prisma migrate dev     # Create and apply migrations
npx prisma migrate deploy  # Apply pending migrations (production)
npx prisma studio          # Open Prisma Studio (visual DB browser)
npx prisma generate        # Regenerate Prisma Client
npm run db:seed            # Seed demo data
```

## Demo Accounts

| Role        | Email                       | Password     |
| ----------- | --------------------------- | ------------ |
| Super Admin | admin@bookingcalendar.com   | Password123! |
| Client      | client@bookingcalendar.com  | Password123! |
| Cleaner     | cleaner@bookingcalendar.com | Password123! |

## Environment Variables

| Variable             | Description                       | Default                                                                       |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string      | `postgresql://postgres:postgres@localhost:5432/bookingcalendar?schema=public` |
| `JWT_ACCESS_SECRET`  | Secret for signing access tokens  | (dev fallback)                                                                |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | (dev fallback)                                                                |
| `JWT_ACCESS_TTL`     | Access token lifetime             | `15m`                                                                         |
| `JWT_REFRESH_TTL`    | Refresh token lifetime            | `7d`                                                                          |
| `NODE_ENV`           | Environment mode                  | `development`                                                                 |

## Project Structure

```
bookingCalendar/
├── app/                    # Next.js App Router (pages + API routes)
│   ├── (auth)/             # Login / Register
│   ├── api/                # REST API endpoints
│   └── dashboard/          # Role-based dashboards
├── components/             # React components (UI + dashboard + sections)
├── services/               # Business logic layer
├── repositories/           # Database access layer (Prisma queries only)
├── dto/                    # Zod validation schemas
├── models/                 # Domain types
├── hooks/                  # TanStack Query hooks
├── lib/                    # Shared utilities (auth, JWT, errors, API client)
├── prisma/                 # Schema, migrations, seed
├── Dockerfile              # Multi-stage production build
└── docker-compose.yml      # PostgreSQL + app
```

## API Endpoints

| Method           | Endpoint              | Description         |
| ---------------- | --------------------- | ------------------- |
| POST             | `/api/auth/register`  | Create account      |
| POST             | `/api/auth/login`     | Sign in             |
| POST             | `/api/auth/logout`    | Sign out            |
| POST             | `/api/auth/refresh`   | Refresh tokens      |
| GET              | `/api/auth/me`        | Current user        |
| GET/POST         | `/api/users`          | List / create users |
| GET/PATCH/DELETE | `/api/users/[id]`     | User CRUD           |
| GET              | `/api/users/cleaners` | List cleaners       |
| GET              | `/api/users/clients`  | List clients        |

## Building for Production

```bash
# Local build
npm run build
npm start

# Docker build (migrations run automatically on startup)
docker compose build
docker compose up -d

# Seed the initial super admin (first run only)
docker compose exec app node prisma/seed.mjs
```

## License

MIT
