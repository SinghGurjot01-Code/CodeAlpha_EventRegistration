-- Migration 0001: Users, Events, and Registrations schema for EventHub (Cloudflare D1 / SQLite)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  phone         TEXT    NOT NULL DEFAULT '',
  organization  TEXT    NOT NULL DEFAULT '',
  role          TEXT    NOT NULL DEFAULT 'organizer' CHECK (role IN ('user', 'organizer')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  category        TEXT    NOT NULL CHECK (category IN ('Conference', 'Workshop', 'Summit', 'Hackathon')),
  description     TEXT    NOT NULL DEFAULT '',
  location        TEXT    NOT NULL,
  event_date      TEXT    NOT NULL,
  max_capacity    INTEGER NOT NULL CHECK (max_capacity > 0),
  base_registered INTEGER NOT NULL DEFAULT 0 CHECK (base_registered >= 0),
  image_reference TEXT    NOT NULL DEFAULT 'Conference',
  organizer_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT    NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_status_category ON events(status, category);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);

CREATE TABLE IF NOT EXISTS registrations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  confirmation_code TEXT    NOT NULL UNIQUE,
  event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  full_name         TEXT    NOT NULL,
  email             TEXT    NOT NULL COLLATE NOCASE,
  phone             TEXT    NOT NULL,
  organization      TEXT    NOT NULL DEFAULT '',
  ticket_quantity   INTEGER NOT NULL DEFAULT 1 CHECK (ticket_quantity >= 1 AND ticket_quantity <= 10),
  status            TEXT    NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_registrations_event_status ON registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_user_status ON registrations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_registrations_email_status ON registrations(email, status);

-- Database-level unique constraints preventing duplicate active registrations for the same user/email and event
CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_active_user_event
  ON registrations(event_id, user_id)
  WHERE status = 'confirmed' AND user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_registrations_active_email_event
  ON registrations(event_id, lower(email))
  WHERE status = 'confirmed';

-- Seed the 3 initial events from eventhub.html so the dashboard renders identically out of the box
INSERT OR IGNORE INTO events (id, title, category, description, location, event_date, max_capacity, base_registered, image_reference, status)
VALUES
  (1, 'Tech Innovators Conference 2025', 'Conference', 'A full day of talks on AI, cloud and developer tools from leading engineers.', 'New Delhi, India', 'Sat, Feb 15, 2025 • 10:00 AM', 200, 120, 'Conference', 'published'),
  (2, 'Web Development Workshop', 'Workshop', 'Hands-on session building a responsive web app from scratch. Bring your laptop.', 'Online (Zoom)', 'Sun, Feb 23, 2025 • 2:00 PM', 150, 85, 'Workshop', 'published'),
  (3, 'Startup Summit 2025', 'Summit', 'Founders and investors share lessons on building and funding new companies.', 'Bengaluru, India', 'Sat, Mar 8, 2025 • 9:00 AM', 500, 310, 'Summit', 'published');
