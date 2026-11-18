const express = require('express');
const authController = require('../controllers/authController');
const eventController = require('../controllers/eventController');
const registrationController = require('../controllers/registrationController');
const { optionalAuth, requireAuth, requireOrganizer } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

const authLimiter = rateLimit({ windowMs: 60000, max: 60, keyPrefix: 'auth' });
const writeLimiter = rateLimit({ windowMs: 60000, max: 120, keyPrefix: 'write' });

// Health check
router.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'eventhub-api' }));

// Authentication endpoints
router.post('/api/auth/register', authLimiter, optionalAuth, authController.register);
router.post('/api/auth/login', authLimiter, optionalAuth, authController.login);
router.post('/api/auth/logout', authController.logout);
router.get('/api/auth/me', optionalAuth, authController.me);

// Event endpoints
router.get('/api/events', optionalAuth, eventController.listEvents);
router.get('/api/events/:id', optionalAuth, eventController.getEvent);
router.post('/api/events', writeLimiter, requireAuth, requireOrganizer, eventController.createEvent);
router.put('/api/events/:id', writeLimiter, requireAuth, requireOrganizer, eventController.updateEvent);
router.delete('/api/events/:id', writeLimiter, requireAuth, requireOrganizer, eventController.deleteEvent);

// Registration endpoints
router.post('/api/events/:id/register', writeLimiter, optionalAuth, registrationController.registerForEvent);
router.get('/api/events/:id/registrations', requireAuth, requireOrganizer, registrationController.listEventRegistrations);
router.get('/api/registrations/my', optionalAuth, registrationController.listMyRegistrations);
router.get('/api/registrations/:id', optionalAuth, registrationController.getRegistration);
router.delete('/api/registrations/:id', writeLimiter, optionalAuth, registrationController.cancelRegistration);

module.exports = router;
