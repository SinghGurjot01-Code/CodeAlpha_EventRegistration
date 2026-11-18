/**
 * D1 Repository for Events. Computes active registration count and available seats dynamically from D1.
 */
function createEventRepository(db) {
  const formatEvent = (row) => {
    if (!row) return null;
    const activeTickets = Number(row.active_tickets || 0);
    const baseRegistered = Number(row.base_registered || 0);
    const maxCapacity = Number(row.max_capacity);
    const registeredCount = baseRegistered + activeTickets;
    const availableSeats = Math.max(0, maxCapacity - registeredCount);
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description || '',
      location: row.location,
      eventDate: row.event_date,
      maxCapacity,
      baseRegistered,
      activeTickets,
      registeredCount,
      availableSeats,
      imageReference: row.image_reference || row.category,
      organizerId: row.organizer_id || null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const baseSelect = `
    SELECT
      e.id, e.title, e.category, e.description, e.location, e.event_date,
      e.max_capacity, e.base_registered, e.image_reference, e.organizer_id,
      e.status, e.created_at, e.updated_at,
      COALESCE(SUM(CASE WHEN r.status = 'confirmed' THEN r.ticket_quantity ELSE 0 END), 0) AS active_tickets
    FROM events e
    LEFT JOIN registrations r ON r.event_id = e.id
  `;

  return {
    async list({ q = '', category = '', when = 'up', status = '' } = {}) {
      const clauses = [];
      const params = [];

      if (status) {
        params.push(status);
        clauses.push(`e.status = ?${params.length}`);
      } else if (when === 'past') {
        clauses.push(`e.status = 'completed'`);
      } else {
        clauses.push(`e.status = 'published'`);
      }

      if (category) {
        params.push(category);
        clauses.push(`e.category = ?${params.length}`);
      }

      if (q) {
        const pattern = `%${q.toLowerCase()}%`;
        params.push(pattern);
        const idx = params.length;
        clauses.push(
          `(lower(e.title) LIKE ?${idx} OR lower(e.category) LIKE ?${idx} OR lower(e.location) LIKE ?${idx} OR lower(e.description) LIKE ?${idx})`
        );
      }

      const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const sql = `${baseSelect} ${whereSql} GROUP BY e.id ORDER BY e.id DESC`;
      const stmt = db.prepare(sql);
      const bound = params.length ? stmt.bind(...params) : stmt;
      const { results } = await bound.all();
      return (results || []).map(formatEvent);
    },

    async findById(id) {
      const row = await db
        .prepare(`${baseSelect} WHERE e.id = ?1 GROUP BY e.id`)
        .bind(Number(id))
        .first();
      return formatEvent(row);
    },

    async create({
      title,
      category,
      description = 'Created by you.',
      location = 'To be announced',
      eventDate = 'Date to be announced',
      maxCapacity = 100,
      imageReference,
      organizerId,
      status = 'published',
    }) {
      const res = await db
        .prepare(
          `INSERT INTO events (title, category, description, location, event_date, max_capacity, base_registered, image_reference, organizer_id, status)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9)`
        )
        .bind(
          title,
          category,
          description,
          location,
          eventDate,
          Number(maxCapacity),
          imageReference || category,
          organizerId ? Number(organizerId) : null,
          status
        )
        .run();
      return this.findById(res?.meta?.last_row_id);
    },

    async update(id, fields) {
      const existing = await this.findById(id);
      if (!existing) return null;
      const title = fields.title ?? existing.title;
      const category = fields.category ?? existing.category;
      const description = fields.description ?? existing.description;
      const location = fields.location ?? existing.location;
      const eventDate = fields.eventDate ?? existing.eventDate;
      const maxCapacity = fields.maxCapacity !== undefined ? Number(fields.maxCapacity) : existing.maxCapacity;
      const imageReference = fields.imageReference ?? existing.imageReference;
      const status = fields.status ?? existing.status;

      await db
        .prepare(
          `UPDATE events
           SET title = ?1, category = ?2, description = ?3, location = ?4,
               event_date = ?5, max_capacity = ?6, image_reference = ?7, status = ?8,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?9`
        )
        .bind(title, category, description, location, eventDate, maxCapacity, imageReference, status, Number(id))
        .run();
      return this.findById(id);
    },

    async remove(id) {
      const res = await db.prepare(`DELETE FROM events WHERE id = ?1`).bind(Number(id)).run();
      return (res?.meta?.changes || 0) > 0;
    },
  };
}

module.exports = { createEventRepository };
