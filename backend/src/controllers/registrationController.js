const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const registerForEvent = asyncHandler(async (req, res) => {
  const { registrationService } = req.ctx;
  const result = await registrationService.registerForEvent({
    eventId: req.params.id,
    user: req.user,
    payload: req.body || {},
  });
  res.status(201).json(result);
});

const listMyRegistrations = asyncHandler(async (req, res) => {
  const { registrationService } = req.ctx;
  const registrations = await registrationService.getMyRegistrations({
    user: req.user,
    guestCodes: req.guestCodes,
  });
  res.json({ registrations });
});

const getRegistration = asyncHandler(async (req, res) => {
  const { registrationService } = req.ctx;
  const registration = await registrationService.getRegistration({
    idOrCode: req.params.id,
    user: req.user,
    guestCodes: req.guestCodes,
  });
  res.json({ registration });
});

const cancelRegistration = asyncHandler(async (req, res) => {
  const { registrationService } = req.ctx;
  const result = await registrationService.cancelRegistration({
    idOrCode: req.params.id,
    user: req.user,
    guestCodes: req.guestCodes,
  });
  res.json(result);
});

const listEventRegistrations = asyncHandler(async (req, res) => {
  const { registrationService } = req.ctx;
  const result = await registrationService.listEventRegistrations({
    eventId: req.params.id,
    user: req.user,
  });
  res.json(result);
});

module.exports = {
  registerForEvent,
  listMyRegistrations,
  getRegistration,
  cancelRegistration,
  listEventRegistrations,
};
