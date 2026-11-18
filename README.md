# CodeAlpha Task 2 — EventHub (Event Registration System)

A full-stack **Event Registration System** built for the **CodeAlpha Backend Development Internship — Task 2**.  
EventHub connects the existing responsive purple-and-white frontend (`eventhub.html`) to a production-grade **Node.js + Express.js** backend running on **Cloudflare Workers** (`nodejs_compat` + `httpServerHandler`) with **Cloudflare D1** (SQLite-compatible relational database).

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology Stack](#3-technology-stack)
4. [Architecture & Project Structure](#4-architecture--project-structure)
5. [Database Schema (Cloudflare D1)](#5-database-schema-cloudflare-d1)
6. [API Documentation](#6-api-documentation)
7. [Example Requests & Responses](#7-example-requests--responses)
8. [Local Installation & D1 Setup](#8-local-installation--d1-setup)
9. [Testing Instructions](#9-testing-instructions)
10. [Environment Variables & Configuration](#10-environment-variables--configuration)
11. [Deployment Instructions (Vercel + Cloudflare Workers & D1)](#11-deployment-instructions-vercel--cloudflare-workers--d1)

---

## 1. Project Overview

EventHub allows attendees and event organizers to discover, search, filter, create, and register for events:
- **Attendees & Guests** can browse upcoming or past events, search by title/category/location, inspect event details, register for 1–5 tickets (either as a guest or signed-in user), receive a unique `EH-XXXXXX` confirmation ticket, view their registration history, and cancel tickets.
- **Event Organizers** can create new events, update their events (title, category, location, date, capacity, status), view all attendee registrations for their events, or delete events they own.
- **Strict Frontend Preservation**: The approved `eventhub.html` design, purple-and-white color palette, typography, embedded base64 images, and modal flows are preserved 100% verbatim while replacing browser-only `localStorage` data (`eh_users`, `eh_session`, `eh_regs`) with authoritative Cloudflare D1 database persistence.

---

## 2. Features

- **Express.js on Cloudflare Workers**: Full Express 5 routing, middleware, and controllers bridged via `cloudflare:node` (`httpServerHandler`).
- **Authoritative Cloudflare D1 Storage**: Parameterized SQL queries (`?1, ?2, ...`) with `FOREIGN KEY`, `CHECK`, `NOT NULL`, and partial `UNIQUE` indexes.
- **Atomic Capacity & Duplicate Protection**: Single-statement conditional `INSERT INTO registrations ... SELECT ... FROM events WHERE ...` prevents race-condition overbooking and duplicate active registrations for the same user/email and event.
- **Authentication & Role-Based Authorization**:
  - Password hashing with `node:crypto` `scrypt` + 16-byte random salt and constant-time `timingSafeEqual` verification.
  - HMAC-SHA256 signed session tokens delivered via both `HttpOnly; SameSite=Lax` cookie (`eh_token`) and `Authorization: Bearer <token>` header.
  - Seamless guest-to-account ticket claiming: if a guest registers for an event and later creates an account or signs in with the same email (or browser session), their guest registrations in D1 are automatically linked to their user account.
- **Rate Limiting & Abuse Protection**: Sliding-window per-IP rate limiting on authentication and write endpoints.

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (preserved from `eventhub.html`) |
| **Backend Framework** | Node.js + **Express.js 5** |
| **Runtime** | **Cloudflare Workers** (`nodejs_compat`, `enable_nodejs_http_server_modules`) |
| **Database** | **Cloudflare D1** (SQLite-compatible relational SQL) |
| **CLI & Tooling** | Cloudflare **Wrangler 4**, **Vercel CLI** |
| **Testing** | Node.js built-in test runner (`node --test`), automated Worker + local D1 integration suite |
| **Version Control** | Git & GitHub |

---

## 4. Architecture & Project Structure

```
CodeAlpha_EventRegistration/
├── frontend/
│   ├── index.html              # Preserved EventHub markup
│   ├── eventhub.backup.html    # Untouched backup of original single-file eventhub.html
│   ├── css/
│   │   └── styles.css          # Exact extracted EventHub stylesheet + embedded hero background
│   ├── js/
│   │   ├── config.js           # Runtime API_BASE_URL configuration
│   │   └── app.js              # Frontend logic connected to Express + D1 REST APIs
│   └── assets/
│       └── event-images.js     # Original embedded base64 JPEG event card images
├── backend/
│   ├── src/
│   │   ├── worker.mjs          # Cloudflare Worker entry point (httpServerHandler + D1 binding)
│   │   ├── app.js              # Express app factory (CORS, JSON parser, context, routes, error handler)
│   │   ├── routes/
│   │   │   └── index.js        # API route definitions
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── eventController.js
│   │   │   └── registrationController.js
│   │   ├── services/
│   │   │   ├── authService.js
│   │   │   ├── eventService.js
│   │   │   └── registrationService.js
│   │   ├── repositories/
│   │   │   ├── userRepository.js
│   │   │   ├── eventRepository.js
│   │   │   └── registrationRepository.js
│   │   ├── middleware/
│   │   │   ├── auth.js         # optionalAuth, requireAuth, requireOrganizer, cookie helpers
│   │   │   ├── rateLimit.js    # Per-IP sliding-window rate limiter
│   │   │   └── errorHandler.js # 404 + centralized error formatting
│   │   └── utils/
│   │       ├── crypto.js       # scrypt password hashing & HMAC-SHA256 token signing
│   │       ├── confirmationCode.js # EH-XXXXXX unique ticket code generator
│   │       └── validators.js   # Input validation & sanitization helpers
│   ├── migrations/
│   │   └── 0001_init_eventhub.sql # D1 schema migration + initial 3 EventHub events seed
│   ├── tests/
│   │   ├── unit.test.js        # Unit tests (crypto, tokens, confirmation codes, validators)
│   │   └── api.test.js         # End-to-end Worker + local D1 integration tests (20 scenarios)
│   ├── package.json
│   ├── wrangler.jsonc
│   └── .dev.vars.example
├── .gitignore
└── README.md
```

---

## 5. Database Schema (Cloudflare D1)

Defined in [`backend/migrations/0001_init_eventhub.sql`](backend/migrations/0001_init_eventhub.sql):

### `users`
| Column | Type | Constraints |
|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |
| `full_name` | `TEXT` | `NOT NULL` |
| `email` | `TEXT` | `NOT NULL UNIQUE COLLATE NOCASE` |
| `password_hash` | `TEXT` | `NOT NULL` (`scrypt:<salt>:<hash>`) |
| `phone` | `TEXT` | `NOT NULL DEFAULT ''` |
| `organization` | `TEXT` | `NOT NULL DEFAULT ''` |
| `role` | `TEXT` | `NOT NULL DEFAULT 'organizer' CHECK (role IN ('user', 'organizer'))` |
| `created_at` | `TEXT` | `NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` |
| `updated_at` | `TEXT` | `NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` |

### `events`
| Column | Type | Constraints |
|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |
| `title` | `TEXT` | `NOT NULL` |
| `category` | `TEXT` | `NOT NULL CHECK (category IN ('Conference', 'Workshop', 'Summit', 'Hackathon'))` |
| `description` | `TEXT` | `NOT NULL DEFAULT ''` |
| `location` | `TEXT` | `NOT NULL` |
| `event_date` | `TEXT` | `NOT NULL` |
| `max_capacity` | `INTEGER` | `NOT NULL CHECK (max_capacity > 0)` |
| `base_registered` | `INTEGER` | `NOT NULL DEFAULT 0 CHECK (base_registered >= 0)` |
| `image_reference` | `TEXT` | `NOT NULL DEFAULT 'Conference'` |
| `organizer_id` | `INTEGER` | `REFERENCES users(id) ON DELETE SET NULL` |
| `status` | `TEXT` | `NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed'))` |
| `created_at` | `TEXT` | `NOT NULL` |
| `updated_at` | `TEXT` | `NOT NULL` |

### `registrations`
| Column | Type | Constraints |
|---|---|---|
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` |
| `confirmation_code` | `TEXT` | `NOT NULL UNIQUE` (`EH-XXXXXX`) |
| `event_id` | `INTEGER` | `NOT NULL REFERENCES events(id) ON DELETE CASCADE` |
| `user_id` | `INTEGER` | `REFERENCES users(id) ON DELETE SET NULL` |
| `full_name` | `TEXT` | `NOT NULL` |
| `email` | `TEXT` | `NOT NULL COLLATE NOCASE` |
| `phone` | `TEXT` | `NOT NULL` |
| `organization` | `TEXT` | `NOT NULL DEFAULT ''` |
| `ticket_quantity` | `INTEGER` | `NOT NULL DEFAULT 1 CHECK (ticket_quantity >= 1 AND ticket_quantity <= 10)` |
| `status` | `TEXT` | `NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled'))` |
| `created_at` | `TEXT` | `NOT NULL` |
| `cancelled_at` | `TEXT` | Nullable timestamp set upon cancellation |

**Unique Active Registration Constraints:**
- `uq_registrations_active_user_event`: `UNIQUE (event_id, user_id) WHERE status = 'confirmed' AND user_id IS NOT NULL`
- `uq_registrations_active_email_event`: `UNIQUE (event_id, lower(email)) WHERE status = 'confirmed'`

---

## 6. API Documentation

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health check (`{"status":"ok","service":"eventhub-api"}`) |
| `POST` | `/api/auth/register` | Public | Register a user account; claims any matching guest registrations |
| `POST` | `/api/auth/login` | Public | Authenticate user and issue session cookie + Bearer token |
| `POST` | `/api/auth/logout` | Public | Clear session cookie |
| `GET` | `/api/auth/me` | Auth | Return currently authenticated user profile (never includes password hash) |
| `GET` | `/api/events` | Public | List events with `registeredCount` and `availableSeats`. Query params: `q`, `category`, `when` (`up` / `past`), `status` |
| `GET` | `/api/events/:id` | Public | Retrieve single event details with live seat availability |
| `POST` | `/api/events` | Organizer | Create a new event |
| `PUT` | `/api/events/:id` | Organizer (Owner) | Update an existing event |
| `DELETE` | `/api/events/:id` | Organizer (Owner) | Delete an event |
| `POST` | `/api/events/:id/register` | Public / Auth | Register for an event (supports guest or authenticated user, 1–5 tickets, atomic capacity check) |
| `GET` | `/api/registrations/my` | Public / Auth | List active registrations for current user (or guest confirmation codes in `X-Guest-Codes`) |
| `GET` | `/api/registrations/:id` | Owner / Code / Organizer | Get ticket details by numeric ID or `EH-XXXXXX` confirmation code |
| `DELETE` | `/api/registrations/:id` | Owner / Code | Cancel a registration and release seats immediately |
| `GET` | `/api/events/:id/registrations` | Organizer (Owner) | View all registrations for an organizer's event |

---

## 7. Example Requests & Responses

### Register a User (`POST /api/auth/register`)
```bash
curl -X POST http://localhost:8787/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Aarav Sharma","email":"aarav@example.com","password":"Password123"}'
```
`201 Created`
```json
{
  "user": {
    "id": 1,
    "fullName": "Aarav Sharma",
    "email": "aarav@example.com",
    "phone": "",
    "organization": "",
    "role": "organizer",
    "createdAt": "2026-11-18T17:20:00.000Z",
    "updatedAt": "2026-11-18T17:20:00.000Z"
  },
  "token": "<signed-jwt-token>"
}
```

### Register for an Event (`POST /api/events/1/register`)
```bash
curl -X POST http://localhost:8787/api/events/1/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Rohan Mehta","email":"rohan@example.com","phone":"9876543210","organization":"CodeAlpha","ticketQuantity":2}'
```
`201 Created`
```json
{
  "registration": {
    "id": 1,
    "confirmationCode": "EH-7K9P2M",
    "eventId": 1,
    "userId": null,
    "fullName": "Rohan Mehta",
    "email": "rohan@example.com",
    "phone": "9876543210",
    "organization": "CodeAlpha",
    "ticketQuantity": 2,
    "status": "confirmed",
    "createdAt": "2026-11-18T17:21:10.123Z",
    "cancelledAt": null
  },
  "event": {
    "id": 1,
    "title": "Tech Innovators Conference 2025",
    "maxCapacity": 200,
    "registeredCount": 122,
    "availableSeats": 78
  }
}
```

---

## 8. Local Installation & D1 Setup

Requirements: **Node.js 20+** and npm.

```bash
git clone https://github.com/SinghGurjot01-Code/CodeAlpha_EventRegistration.git
cd CodeAlpha_EventRegistration/backend
npm install

# Apply D1 schema migration and seed initial EventHub events into local D1 (.wrangler/)
npm run db:migrate:local

# Start local Cloudflare Worker + static frontend at http://localhost:8787
npm run dev
```

Open <http://localhost:8787> in your browser.

---

## 9. Testing Instructions

Run the complete automated test suite (16 test suites covering 20+ unit & integration scenarios against a real local Worker and isolated local D1 database):

```bash
cd backend
npm test            # Full unit + integration test suite
npm run test:unit   # Fast unit tests only
```

What the automated suite verifies:
- `GET /api/health` and static frontend asset delivery
- User registration, scrypt hashing, duplicate email rejection, and ensuring `password_hash` is never exposed
- Login, `/api/auth/me`, invalid credentials rejection (`401`), and logout
- Event listing, individual event details, search (`?q=`), category filter (`?category=`), and date filter (`?when=past`)
- Organizer event creation and unauthorized creation prevention (`401` unauthenticated, `403` non-organizer)
- Event editing, ownership checks, and deletion
- Authenticated and guest event registrations with multiple ticket quantities
- Duplicate registration rejection (`409`) and capacity/overbooking enforcement (`400`)
- Rejection of registrations on cancelled events
- Registration cancellation (`DELETE /api/registrations/:id`) and immediate seat availability restoration
- Confirmation code uniqueness (`EH-XXXXXX`) and D1 database persistence across a full Worker restart

---

## 10. Environment Variables & Configuration

Configured in [`backend/wrangler.jsonc`](backend/wrangler.jsonc) and [`backend/.dev.vars.example`](backend/.dev.vars.example):

| Variable / Secret | Where Set | Description |
|---|---|---|
| `DB` | `wrangler.jsonc` (`d1_databases`) | Cloudflare D1 binding (`codealpha-eventhub-db`) |
| `JWT_SECRET` | `.dev.vars` locally / `wrangler secret put JWT_SECRET` in prod | Secret key used to sign HMAC-SHA256 session tokens |
| `CORS_ORIGIN` | `wrangler.jsonc` (`vars`) | Comma-separated allowed origins when frontend is hosted on a separate domain |
| `SESSION_TTL_HOURS` | `wrangler.jsonc` (`vars`) | Token and cookie lifetime in hours (default `168` = 7 days) |

Frontend configuration lives in [`frontend/js/config.js`](frontend/js/config.js) (`window.APP_CONFIG = { API_BASE_URL: '' }`). Leave `API_BASE_URL` empty when served from the same origin (`wrangler dev` or Vercel proxy rewrites).

---

## 11. Deployment Instructions (Vercel + Cloudflare Workers & D1)

```bash
# 1. Create and migrate the remote Cloudflare D1 database
cd backend
npx wrangler login
npx wrangler d1 create codealpha-eventhub-db
# Copy the returned database_id into backend/wrangler.jsonc -> d1_databases[0].database_id
npm run db:migrate:remote

# 2. Set the production JWT secret and deploy the Express Worker
npx wrangler secret put JWT_SECRET
npm run deploy

# 3. Deploy the frontend to Vercel
cd ../frontend
vercel deploy --prod
```

---

## License

MIT
