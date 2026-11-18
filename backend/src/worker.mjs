// Cloudflare Workers entry point: runs Express.js via `cloudflare:node` httpServerHandler + D1 binding.
import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import http from 'node:http';
import { createApp } from './app.js';
import { createUserRepository } from './repositories/userRepository.js';
import { createEventRepository } from './repositories/eventRepository.js';
import { createRegistrationRepository } from './repositories/registrationRepository.js';
import { createAuthService } from './services/authService.js';
import { createEventService } from './services/eventService.js';
import { createRegistrationService } from './services/registrationService.js';

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

let cached;
function resolveContext() {
  if (!cached) {
    const userRepo = createUserRepository(env.DB);
    const eventRepo = createEventRepository(env.DB);
    const registrationRepo = createRegistrationRepository(env.DB);
    const jwtSecret = env.JWT_SECRET || 'eventhub-dev-fallback-secret-replace-in-prod-32b';
    const sessionTtlHours = Number(env.SESSION_TTL_HOURS) || 168;

    cached = {
      authService: createAuthService({ userRepo, registrationRepo, jwtSecret, sessionTtlHours }),
      eventService: createEventService({ eventRepo }),
      registrationService: createRegistrationService({ registrationRepo, eventRepo, userRepo }),
      config: {
        corsOrigins: list(env.CORS_ORIGIN),
        sessionTtlHours,
      },
    };
  }
  return cached;
}

const app = createApp(resolveContext);
http.createServer(app).listen(8080);

export default httpServerHandler({ port: 8080 });
