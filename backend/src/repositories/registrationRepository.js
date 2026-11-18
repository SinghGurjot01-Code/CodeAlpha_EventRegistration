/**
 * D1 Repository for Event Registrations.
 * Uses an atomic conditional INSERT ... SELECT statement so capacity checks, event status checks,
 * and unique active registration constraints are enforced in a single atomic SQLite step.
 */
function createRegistrationRepository(db) {
  const formatRegistration = (row) =>
    row
      ? {
          id: row.id,
          confirmationCode: row.confirmation_code,
          eventId: row.event_id,
          userId: row.user_id || null,
          fullName: row.full_name,
          email: row.email,
          phone: row.phone,
          organization: row.organization || '',
          ticketQuantity: Number(row.ticket_quantity),
          status: row.status,
          createdAt: row.created_at,
          cancelledAt: row.cancelled_at || null,
          event: row.event_title
            ? {
                id: row.event_id,
                title: row.event_title,
                category: row.event_category,
                location: row.event_location,
                eventDate: row.event_date,
                imageReference: row.event_image_reference,
                status: row.event_status,
              }
            : undefined,
        }
      : null;

  const joinedSelect = `
    SELECT
      r.id, r.confirmation_code, r.event_id, r.user_id, r.full_name, r.email,
      r.phone, r.organization, r.ticket_quantity, r.status, r.created_at, r.cancelled_at,
      e.title AS event_title, e.category AS event_category, e.location AS event_location,
      e.event_date AS event_date, e.image_reference AS event_image_reference, e.status AS event_status
    FROM registrations r
    JOIN events e ON e.id = r.event_id
  `;

  return {
    /**
     * Atomically insert a registration only if:
     *  - The event exists and has status = 'published'
     *  - base_registered + current confirmed tickets + ticketQuantity <= max_capacity
     *  - Neither the user_id nor the email already has a confirmed registration for this event
     */
    async createAtomic({
      confirmationCode,
      eventId,
      userId = null,
      fullName,
      email,
      phone,
      organization = '',
      ticketQuantity = 1,
    }) {
      const normalizedEmail = email.trim().toLowerCase();
      const qty = Number(ticketQuantity);
      const eid = Number(eventId);
      const uid = userId ? Number(userId) : null;

      try {
        const res = await db
          .prepare(
            `INSERT INTO registrations (
               confirmation_code, event_id, user_id, full_name, email, phone, organization, ticket_quantity, status
             )
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'confirmed'
             FROM events e
             WHERE e.id = ?2
               AND e.status = 'published'
               AND (
                 e.base_registered + COALESCE(
                   (SELECT SUM(r2.ticket_quantity) FROM registrations r2 WHERE r2.event_id = e.id AND r2.status = 'confirmed'),
                   0
                 ) + ?8
               ) <= e.max_capacity`
          )
          .bind(confirmationCode, eid, uid, fullName.trim(), normalizedEmail, phone.trim(), organization.trim(), qty)
          .run();

        if (!res?.meta?.changes) {
          return { inserted: false, reason: 'CAPACITY_OR_STATUS' };
        }
        const created = await this.findById(res.meta.last_row_id);
        return { inserted: true, registration: created };
      } catch (err) {
        const msg = String(err?.message || err?.cause?.message || '');
        if (/uq_registrations_active_user_event|uq_registrations_active_email_event/i.test(msg)) {
          return { inserted: false, reason: 'DUPLICATE_REGISTRATION' };
        }
        if (/registrations\.confirmation_code|UNIQUE constraint failed/i.test(msg)) {
          // Could be either confirmation_code collision or duplicate active registration index
          const dup = await this.findActiveForEvent({ eventId: eid, userId: uid, email: normalizedEmail });
          if (dup) return { inserted: false, reason: 'DUPLICATE_REGISTRATION' };
          return { inserted: false, reason: 'CODE_COLLISION' };
        }
        throw err;
      }
    },

    async findActiveForEvent({ eventId, userId = null, email = '' }) {
      const eid = Number(eventId);
      const normEmail = String(email || '').trim().toLowerCase();
      if (userId) {
        const byUser = await db
          .prepare(`${joinedSelect} WHERE r.event_id = ?1 AND r.status = 'confirmed' AND (r.user_id = ?2 OR lower(r.email) = ?3)`)
          .bind(eid, Number(userId), normEmail)
          .first();
        if (byUser) return formatRegistration(byUser);
      }
      if (normEmail) {
        const byEmail = await db
          .prepare(`${joinedSelect} WHERE r.event_id = ?1 AND r.status = 'confirmed' AND lower(r.email) = ?2`)
          .bind(eid, normEmail)
          .first();
        if (byEmail) return formatRegistration(byEmail);
      }
      return null;
    },

    async findById(id) {
      const row = await db.prepare(`${joinedSelect} WHERE r.id = ?1`).bind(Number(id)).first();
      return formatRegistration(row);
    },

    async findByConfirmationCode(code) {
      const row = await db
        .prepare(`${joinedSelect} WHERE upper(r.confirmation_code) = upper(?1)`)
        .bind(String(code || '').trim())
        .first();
      return formatRegistration(row);
    },

    async findByIdOrCode(idOrCode) {
      const s = String(idOrCode || '').trim();
      if (/^\d+$/.test(s)) return this.findById(Number(s));
      return this.findByConfirmationCode(s);
    },

    async listForUser({ userId = null, email = '', codes = [] } = {}) {
      const cleanCodes = (Array.isArray(codes) ? codes : [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter((c) => /^EH-[A-Z0-9]{4,16}$/.test(c))
        .slice(0, 50);

      const clauses = [];
      const params = [];

      if (userId) {
        params.push(Number(userId));
        clauses.push(`r.user_id = ?${params.length}`);
      }
      if (email) {
        params.push(email.trim().toLowerCase());
        clauses.push(`lower(r.email) = ?${params.length}`);
      }
      if (cleanCodes.length) {
        const placeholders = cleanCodes.map((c) => {
          params.push(c);
          return `?${params.length}`;
        });
        clauses.push(`upper(r.confirmation_code) IN (${placeholders.join(', ')})`);
      }

      if (!clauses.length) return [];

      const sql = `${joinedSelect} WHERE r.status = 'confirmed' AND (${clauses.join(' OR ')}) ORDER BY r.id DESC`;
      const { results } = await db.prepare(sql).bind(...params).all();
      return (results || []).map(formatRegistration);
    },

    async listForEvent(eventId) {
      const { results } = await db
        .prepare(`${joinedSelect} WHERE r.event_id = ?1 ORDER BY r.id DESC`)
        .bind(Number(eventId))
        .all();
      return (results || []).map(formatRegistration);
    },

    /**
     * Associate any guest registrations matching the user's email or provided guest confirmation codes with userId.
     */
    async claimGuestRegistrations(userId, email, guestCodes = []) {
      const uid = Number(userId);
      const normEmail = String(email || '').trim().toLowerCase();
      if (normEmail) {
        await db
          .prepare(`UPDATE registrations SET user_id = ?1 WHERE user_id IS NULL AND lower(email) = ?2`)
          .bind(uid, normEmail)
          .run();
      }
      const cleanCodes = (Array.isArray(guestCodes) ? guestCodes : [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter((c) => /^EH-[A-Z0-9]{4,16}$/.test(c))
        .slice(0, 25);
      for (const code of cleanCodes) {
        // Only claim if the user doesn't already have an active registration for that same event
        await db
          .prepare(
            `UPDATE registrations
             SET user_id = ?1
             WHERE upper(confirmation_code) = ?2
               AND user_id IS NULL
               AND NOT EXISTS (
                 SELECT 1 FROM registrations r2
                 WHERE r2.event_id = registrations.event_id
                   AND r2.user_id = ?1
                   AND r2.status = 'confirmed'
               )`
          )
          .bind(uid, code)
          .run();
      }
    },

    async cancel(id) {
      const res = await db
        .prepare(
          `UPDATE registrations
           SET status = 'cancelled',
               cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?1 AND status = 'confirmed'`
        )
        .bind(Number(id))
        .run();
      if (!res?.meta?.changes) return null;
      return this.findById(id);
    },
  };
}

module.exports = { createRegistrationRepository };
