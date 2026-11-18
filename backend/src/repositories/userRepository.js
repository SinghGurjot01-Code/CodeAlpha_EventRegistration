/**
 * D1 Repository for Users. Never returns password_hash in public user objects unless explicitly queried for auth verification.
 */
function createUserRepository(db) {
  const toPublicUser = (row) =>
    row
      ? {
          id: row.id,
          fullName: row.full_name,
          email: row.email,
          phone: row.phone || '',
          organization: row.organization || '',
          role: row.role,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;

  return {
    async create({ fullName, email, passwordHash, phone = '', organization = '', role = 'organizer' }) {
      const normalizedEmail = email.trim().toLowerCase();
      try {
        const res = await db
          .prepare(
            `INSERT INTO users (full_name, email, password_hash, phone, organization, role)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
          )
          .bind(fullName.trim(), normalizedEmail, passwordHash, phone.trim(), organization.trim(), role)
          .run();
        const id = res?.meta?.last_row_id;
        return this.findById(id);
      } catch (err) {
        if (/UNIQUE constraint failed/i.test(String(err?.message || err?.cause?.message))) {
          return null;
        }
        throw err;
      }
    },

    async findByEmailWithHash(email) {
      const normalizedEmail = String(email || '').trim().toLowerCase();
      return (
        (await db
          .prepare(
            `SELECT id, full_name, email, password_hash, phone, organization, role, created_at, updated_at
             FROM users WHERE lower(email) = ?1`
          )
          .bind(normalizedEmail)
          .first()) || null
      );
    },

    async findById(id) {
      const row = await db
        .prepare(
          `SELECT id, full_name, email, phone, organization, role, created_at, updated_at
           FROM users WHERE id = ?1`
        )
        .bind(Number(id))
        .first();
      return toPublicUser(row);
    },

    async updateProfile(id, { phone, organization }) {
      await db
        .prepare(
          `UPDATE users
           SET phone = COALESCE(NULLIF(?1, ''), phone),
               organization = COALESCE(NULLIF(?2, ''), organization),
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ?3`
        )
        .bind(phone || '', organization || '', Number(id))
        .run();
      return this.findById(id);
    },

    toPublicUser,
  };
}

module.exports = { createUserRepository };
