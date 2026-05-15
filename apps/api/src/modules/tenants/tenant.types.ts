import type { Country } from '../../db/schema/tenants';

// Augment Express Request so any controller / middleware that imports
// 'express' types sees req.tenant typed correctly. Required because the
// tenant middleware attaches `tenant` at runtime.

declare global {
  namespace Express {
    interface Request {
      tenant?: Country;
    }
  }
}
