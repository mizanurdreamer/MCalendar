# bookingCalendar

Short-term rental operations and cleaning management platform built with Next.js 15, Prisma, PostgreSQL, and Docker.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, FullCalendar, TanStack Query
- **Backend**: Next.js Route Handlers, Prisma ORM, PostgreSQL
- **Auth**: JWT (access + refresh tokens), HTTP-only cookies, role-based access control
- **Architecture**: Repository pattern → Service layer → API routes → Cron jobs (separate)

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

## Database Commands

```bash
npx prisma migrate dev             # Create and apply migrations (dev)
npx prisma migrate dev --name name # Create migration with name
npx prisma migrate deploy          # Apply pending migrations (production)
npx prisma studio                  # Open Prisma Studio (visual DB browser)
npx prisma generate                # Regenerate Prisma Client after schema changes
npm run db:seed                    # Seed demo data
```

### Running Migrations in Docker

```bash
# Apply pending migrations to running container
docker exec -it bookingCalendar-app node node_modules/prisma/build/index.js migrate deploy

# Reset database completely
docker exec -it bookingCalendar-app node node_modules/prisma/build/index.js migrate reset

# Nuke volumes and start fresh
docker compose down -v
docker compose up --build
```

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | admin@bookingcalendar.com | Password123! |
| Client | client@bookingcalendar.com | Password123! |
| Cleaner | cleaner@bookingcalendar.com | Password123! |

## Project Structure

```
bookingCalendar/
├── app/                          # Next.js App Router (pages + API routes)
│   ├── (public)/                 # Login / Register
│   ├── admin/                    # Super Admin dashboard
│   │   ├── clients/              # Manage clients
│   │   ├── cleaners/             # Manage cleaners
│   │   └── dashboard/            # Admin overview
│   ├── client/                   # Client dashboard
│   │   ├── today/                # Today's view
│   │   ├── calendar/             # Calendar view
│   │   ├── booking-endpoints/    # Manage iCal endpoints
│   │   └── cleaners/             # View assigned cleaners
│   ├── cleaner/                  # Cleaner dashboard
│   │   └── today/                # Today's schedule
│   └── api/                      # REST API endpoints
│       ├── auth/                 # Login, register, refresh, logout
│       ├── users/                # User CRUD
│       ├── booking-endpoints/    # Booking endpoint CRUD
│       ├── cleaner-task-schedules/  # Client ↔ Cleaner Task Schedules
│       └── cron/                 # Cron job triggers
├── components/                   # React components
│   ├── ui/                       # shadcn/ui primitives
│   ├── dashboard/                # Dashboard layout + nav
│   └── sections/                 # Feature sections (users, endpoints)
├── services/                     # Business logic layer
│   ├── cron/                     # Cron job services (separated)
│   │   ├── CronJobScheduler.ts   # Job registration + execution
│   │   └── BookingDataFetchJob.ts # iCal/JSON fetch logic
│   ├── AuthService.ts            # Auth + token management
│   ├── UserService.ts            # User CRUD
│   ├── ClientBookingEndpointService.ts # Endpoint CRUD
│   ├── GuestBookingInfoService.ts # Read fetched booking data
│   └── CleanerTaskScheduleService.ts # Client ↔ Cleaner Task Schedules
├── repositories/                 # Database access layer (Prisma only)
├── dto/                          # Zod validation schemas
├── models/                       # Domain types
├── hooks/                        # TanStack Query hooks
├── lib/                          # Shared utilities
│   ├── auth.ts                   # Auth helpers
│   ├── jwt.ts                    # JWT signing/verification
│   ├── errors.ts                 # Error hierarchy
│   ├── response.ts               # API response helpers
│   ├── prisma.ts                 # Prisma client
│   └── cron/                     # Cron configuration
│       └── config.ts             # Env-based cron settings
├── prisma/                       # Schema, migrations, seed
├── Dockerfile                    # Multi-stage production build
├── docker-compose.yml            # PostgreSQL + app
└── docker-entrypoint.sh          # Runs migrations on startup
```

## API Endpoints

### Auth

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| POST | `/api/auth/refresh` | Refresh tokens |
| GET | `/api/auth/me` | Current user |

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/users` | List users (supports `?role=`, `?status=`, `?search=`) |
| POST | `/api/users` | Create user |
| GET | `/api/users/[id]` | Get user by ID |
| PATCH | `/api/users/[id]` | Update user |
| DELETE | `/api/users/[id]` | Delete user |
| GET | `/api/users/cleaners` | List all cleaners |
| GET | `/api/users/clients` | List all clients |

### Booking Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/booking-endpoints` | List endpoints (supports `?status=`) |
| POST | `/api/booking-endpoints` | Create endpoint |
| PATCH | `/api/booking-endpoints/[id]` | Update endpoint |
| DELETE | `/api/booking-endpoints/[id]` | Delete endpoint |

### Cleaner Task Schedules

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/cleaner-task-schedules` | List task schedules (supports `?clientId=`, `?cleanerId=`, `?activeOnly=`) |
| POST | `/api/cleaner-task-schedules` | Create assignment |
| PATCH | `/api/cleaner-task-schedules/[id]` | Update assignment |
| DELETE | `/api/cleaner-task-schedules/[id]` | Delete assignment |

### Cron Jobs

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/cron/status` | Get job status (monitoring only) |

The booking data fetch job starts automatically on server boot (see
`instrumentation.ts` → `bootstrapCron`). Its schedule is configured via
`CRON_BOOKING_DATA_FETCH_SCHEDULE_IN_MINUTES` (default `10`, i.e.
`*/10 * * * *`) and is logged at startup.

## Cleaner Task Schedules

Clients can assign cleaners for specific date ranges. The system supports:

- **Many-to-many**: One client can have multiple cleaners, one cleaner can serve multiple clients
- **Date range**: Each assignment has a `startDate` and optional `endDate`
- **Active/inactive**: Soft-disable task schedules without deleting

**Example: Assign a cleaner for summer**

```json
POST /api/cleaner-task-schedules
{
  "clientId": "uuid-of-client",
  "cleanerId": "uuid-of-cleaner",
  "startDate": "2025-06-01T00:00:00Z",
  "endDate": "2025-08-31T23:59:59Z"
}
```

## Architecture Notes

### Separation of Concerns

```
DTO (validation) → Repository (Prisma) → Service (business logic) → API Route (HTTP)
                                                              ↕
                                                    Cron Jobs (infrastructure)
```

- **Repositories**: Only Prisma queries, no business logic
- **Services**: Business rules, validation, orchestration
- **Cron Jobs**: Separated in `services/cron/`, triggered via API or external cron
- **DTOs**: Zod schemas for request validation

### Role-Based Access

| Role | Access |
| --- | --- |
| SUPER_ADMIN | Full access to all users, endpoints, task schedules |
| CLIENT | Manage own endpoints, view assigned cleaners |
| CLEANER | View own schedule and task schedules |

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


