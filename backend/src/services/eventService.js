const { VALID_CATEGORIES, VALID_EVENT_STATUSES, cleanText } = require('../utils/validators');

function createEventService({ eventRepo }) {
  return {
    async listEvents({ q = '', category = '', when = 'up', status = '' } = {}) {
      const cat = VALID_CATEGORIES.includes(category) ? category : '';
      const st = VALID_EVENT_STATUSES.includes(status) ? status : '';
      return eventRepo.list({ q: cleanText(q, 120), category: cat, when, status: st });
    },

    async getEventById(id) {
      if (!id || Number.isNaN(Number(id))) return null;
      return eventRepo.findById(Number(id));
    },

    async createEvent(user, payload = {}) {
      if (!user) {
        const err = new Error('Authentication required to create an event.');
        err.status = 401;
        throw err;
      }
      if (user.role !== 'organizer') {
        const err = new Error('Only authorized event organizers can create events.');
        err.status = 403;
        throw err;
      }

      const title = cleanText(payload.title, 180);
      if (!title) {
        const err = new Error('Event title is required.');
        err.status = 400;
        throw err;
      }

      const category = VALID_CATEGORIES.includes(payload.category) ? payload.category : 'Conference';
      const location = cleanText(payload.location, 180) || 'To be announced';
      const eventDate = cleanText(payload.eventDate || payload.date, 120) || 'Date to be announced';
      const description = cleanText(payload.description || payload.about, 2000) || 'Created by you.';
      const maxCapacity = payload.maxCapacity !== undefined ? Number(payload.maxCapacity) : 100;
      if (!Number.isInteger(maxCapacity) || maxCapacity < 1 || maxCapacity > 100000) {
        const err = new Error('Max capacity must be a positive integer.');
        err.status = 400;
        throw err;
      }
      const status = VALID_EVENT_STATUSES.includes(payload.status) ? payload.status : 'published';
      const imageReference = cleanText(payload.imageReference, 500000) || category;

      return eventRepo.create({
        title,
        category,
        description,
        location,
        eventDate,
        maxCapacity,
        imageReference,
        organizerId: user.id,
        status,
      });
    },

    async updateEvent(user, id, payload = {}) {
      if (!user) {
        const err = new Error('Authentication required.');
        err.status = 401;
        throw err;
      }
      const existing = await this.getEventById(id);
      if (!existing) {
        const err = new Error('Event not found.');
        err.status = 404;
        throw err;
      }
      if (user.role !== 'organizer' || (existing.organizerId && existing.organizerId !== user.id)) {
        const err = new Error('You are not authorized to modify this event.');
        err.status = 403;
        throw err;
      }

      const updates = {};
      if (payload.title !== undefined) {
        const t = cleanText(payload.title, 180);
        if (!t) {
          const err = new Error('Event title cannot be empty.');
          err.status = 400;
          throw err;
        }
        updates.title = t;
      }
      if (payload.category !== undefined) {
        if (!VALID_CATEGORIES.includes(payload.category)) {
          const err = new Error('Invalid event category.');
          err.status = 400;
          throw err;
        }
        updates.category = payload.category;
      }
      if (payload.description !== undefined || payload.about !== undefined) {
        updates.description = cleanText(payload.description ?? payload.about, 2000);
      }
      if (payload.location !== undefined) {
        updates.location = cleanText(payload.location, 180) || 'To be announced';
      }
      if (payload.eventDate !== undefined || payload.date !== undefined) {
        updates.eventDate = cleanText(payload.eventDate ?? payload.date, 120) || 'Date to be announced';
      }
      if (payload.maxCapacity !== undefined) {
        const cap = Number(payload.maxCapacity);
        if (!Number.isInteger(cap) || cap < existing.registeredCount) {
          const err = new Error(`Max capacity cannot be less than current registrations (${existing.registeredCount}).`);
          err.status = 400;
          throw err;
        }
        updates.maxCapacity = cap;
      }
      if (payload.status !== undefined) {
        if (!VALID_EVENT_STATUSES.includes(payload.status)) {
          const err = new Error('Invalid event status.');
          err.status = 400;
          throw err;
        }
        updates.status = payload.status;
      }
      if (payload.imageReference !== undefined) {
        updates.imageReference = cleanText(payload.imageReference, 500000) || existing.category;
      }

      return eventRepo.update(existing.id, updates);
    },

    async deleteEvent(user, id) {
      if (!user) {
        const err = new Error('Authentication required.');
        err.status = 401;
        throw err;
      }
      const existing = await this.getEventById(id);
      if (!existing) {
        const err = new Error('Event not found.');
        err.status = 404;
        throw err;
      }
      if (user.role !== 'organizer' || (existing.organizerId && existing.organizerId !== user.id)) {
        const err = new Error('You are not authorized to delete this event.');
        err.status = 403;
        throw err;
      }
      await eventRepo.remove(existing.id);
      return { deleted: true, id: existing.id };
    },
  };
}

module.exports = { createEventService };
