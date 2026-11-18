const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const listEvents = asyncHandler(async (req, res) => {
  const { eventService } = req.ctx;
  const { q = '', category = '', when = 'up', status = '' } = req.query || {};
  const events = await eventService.listEvents({ q, category, when, status });
  res.json({ events });
});

const getEvent = asyncHandler(async (req, res) => {
  const { eventService } = req.ctx;
  const event = await eventService.getEventById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found.' });
  }
  res.json({ event });
});

const createEvent = asyncHandler(async (req, res) => {
  const { eventService } = req.ctx;
  const event = await eventService.createEvent(req.user, req.body || {});
  res.status(201).json({ event });
});

const updateEvent = asyncHandler(async (req, res) => {
  const { eventService } = req.ctx;
  const event = await eventService.updateEvent(req.user, req.params.id, req.body || {});
  res.json({ event });
});

const deleteEvent = asyncHandler(async (req, res) => {
  const { eventService } = req.ctx;
  const result = await eventService.deleteEvent(req.user, req.params.id);
  res.json(result);
});

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
};
