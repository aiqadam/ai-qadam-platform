// DI tokens for the telegram module. Kept in a separate file so tests +
// the module wiring can both import without dragging in service code.

export const TELEGRAM_REDIS = Symbol('TELEGRAM_REDIS');
