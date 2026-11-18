const { generateConfirmationCode } = require('../utils/confirmationCode');
const { isValidEmail, isValidPhone, cleanText } = require('../utils/validators');

const MAX_CODE_ATTEMPTS = 8;

function createRegistrationService({ registrationRepo, eventRepo, userRepo }) {
  return {
    async registerForEvent({ eventId, user = null, payload = {} }) {
      const event = await eventRepo.findById(eventId);
      if (!event) {
        const err = new Error('Event not found.');
        err.status = 404;
        throw err;
      }
      if (event.status !== 'published') {
        const err = new Error(`Registrations are closed because this event is ${event.status}.`);
        err.status = 400;
        throw err;
      }

      const fullName = cleanText(payload.fullName || payload.name || (user && user.fullName), 120);
      const email = cleanText(payload.email || (user && user.email), 254).toLowerCase();
      const phone = cleanText(payload.phone || (user && user.phone), 30);
      const organization = cleanText(payload.organization ?? payload.org ?? (user && user.organization) ?? '', 120);
      const ticketQuantity = Number(payload.ticketQuantity ?? payload.qty ?? 1);

      if (!fullName) {
        const err = new Error('Enter your full name.');
        err.status = 400;
        throw err;
      }
      if (!isValidEmail(email)) {
        const err = new Error('Enter a valid email address.');
        err.status = 400;
        throw err;
      }
      if (!isValidPhone(phone)) {
        const err = new Error('Enter a valid phone number.');
        err.status = 400;
        throw err;
      }
      if (!Number.isInteger(ticketQuantity) || ticketQuantity < 1 || ticketQuantity > 5) {
        const err = new Error('Ticket quantity must be between 1 and 5.');
        err.status = 400;
        throw err;
      }

      // Check duplicate active registration before attempting insert
      const existingDup = await registrationRepo.findActiveForEvent({
        eventId: event.id,
        userId: user ? user.id : null,
        email,
      });
      if (existingDup) {
        const err = new Error('You are already registered for this event.');
        err.status = 409;
        err.registration = existingDup;
        throw err;
      }

      if (event.availableSeats < ticketQuantity) {
        const err = new Error('Not enough seats left for that many tickets.');
        err.status = 400;
        throw err;
      }

      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
        const confirmationCode = generateConfirmationCode(6 + Math.floor(attempt / 3));
        const res = await registrationRepo.createAtomic({
          confirmationCode,
          eventId: event.id,
          userId: user ? user.id : null,
          fullName,
          email,
          phone,
          organization,
          ticketQuantity,
        });

        if (res.inserted) {
          if (user) {
            await userRepo.updateProfile(user.id, { phone, organization });
          }
          const updatedEvent = await eventRepo.findById(event.id);
          return { registration: res.registration, event: updatedEvent };
        }

        if (res.reason === 'DUPLICATE_REGISTRATION') {
          const err = new Error('You are already registered for this event.');
          err.status = 409;
          throw err;
        }

        if (res.reason === 'CAPACITY_OR_STATUS') {
          const refreshed = await eventRepo.findById(event.id);
          if (!refreshed || refreshed.status !== 'published') {
            const err = new Error('This event is no longer accepting registrations.');
            err.status = 400;
            throw err;
          }
          const err = new Error('Not enough seats left for that many tickets.');
          err.status = 400;
          throw err;
        }
      }

      const err = new Error('Could not generate a unique confirmation code. Please try again.');
      err.status = 500;
      throw err;
    },

    async getMyRegistrations({ user = null, guestCodes = [] }) {
      if (!user && (!Array.isArray(guestCodes) || !guestCodes.length)) {
        return [];
      }
      return registrationRepo.listForUser({
        userId: user ? user.id : null,
        email: user ? user.email : '',
        codes: guestCodes,
      });
    },

    async getRegistration({ idOrCode, user = null, guestCodes = [] }) {
      const reg = await registrationRepo.findByIdOrCode(idOrCode);
      if (!reg) {
        const err = new Error('Registration not found.');
        err.status = 404;
        throw err;
      }

      // Authorized if:
      // 1. Lookup was directly by confirmation code (ticket bearer)
      // 2. Authenticated user owns the registration (by userId or email)
      // 3. Authenticated user is the organizer of the event
      // 4. Confirmation code is in the caller's provided guestCodes
      const isCodeLookup = !/^\d+$/.test(String(idOrCode || '').trim());
      const ownsByUser =
        user &&
        (reg.userId === user.id || (reg.email && user.email && reg.email.toLowerCase() === user.email.toLowerCase()));
      const isCodeInList = (Array.isArray(guestCodes) ? guestCodes : [])
        .map((c) => String(c || '').toUpperCase())
        .includes(reg.confirmationCode.toUpperCase());

      let isOrganizer = false;
      if (user && user.role === 'organizer') {
        const ev = await eventRepo.findById(reg.eventId);
        if (ev && (!ev.organizerId || ev.organizerId === user.id)) isOrganizer = true;
      }

      if (!isCodeLookup && !ownsByUser && !isCodeInList && !isOrganizer) {
        const err = new Error('You do not have permission to view this registration.');
        err.status = user ? 403 : 401;
        throw err;
      }

      return reg;
    },

    async cancelRegistration({ idOrCode, user = null, guestCodes = [] }) {
      const reg = await registrationRepo.findByIdOrCode(idOrCode);
      if (!reg) {
        const err = new Error('Registration not found.');
        err.status = 404;
        throw err;
      }
      if (reg.status === 'cancelled') {
        const err = new Error('Registration is already cancelled.');
        err.status = 400;
        throw err;
      }

      const isCodeLookup = !/^\d+$/.test(String(idOrCode || '').trim());
      const ownsByUser =
        user &&
        (reg.userId === user.id || (reg.email && user.email && reg.email.toLowerCase() === user.email.toLowerCase()));
      const isCodeInList = (Array.isArray(guestCodes) ? guestCodes : [])
        .map((c) => String(c || '').toUpperCase())
        .includes(reg.confirmationCode.toUpperCase());

      // If the registration belongs to a registered user account, require that user unless cancelled by their confirmation code
      if (reg.userId && user && reg.userId !== user.id && !ownsByUser) {
        const err = new Error('You can only cancel your own registrations.');
        err.status = 403;
        throw err;
      }
      if (reg.userId && !user && !isCodeLookup && !isCodeInList) {
        const err = new Error('Authentication required to cancel this registration.');
        err.status = 401;
        throw err;
      }
      if (!reg.userId && !ownsByUser && !isCodeLookup && !isCodeInList) {
        const err = new Error('Confirmation code or authentication required to cancel this registration.');
        err.status = user ? 403 : 401;
        throw err;
      }

      const cancelled = await registrationRepo.cancel(reg.id);
      const updatedEvent = await eventRepo.findById(reg.eventId);
      return { registration: cancelled, event: updatedEvent };
    },

    async listEventRegistrations({ eventId, user }) {
      if (!user) {
        const err = new Error('Authentication required.');
        err.status = 401;
        throw err;
      }
      const event = await eventRepo.findById(eventId);
      if (!event) {
        const err = new Error('Event not found.');
        err.status = 404;
        throw err;
      }
      if (user.role !== 'organizer' || (event.organizerId && event.organizerId !== user.id)) {
        const err = new Error('Only the organizer of this event can view its registrations.');
        err.status = 403;
        throw err;
      }
      const registrations = await registrationRepo.listForEvent(event.id);
      return { event, registrations };
    },
  };
}

module.exports = { createRegistrationService };
