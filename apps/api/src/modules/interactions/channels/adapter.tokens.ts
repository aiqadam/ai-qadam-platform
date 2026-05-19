import type { ChannelAdapter } from '../interactions.types';

// DI token for the multi-provider array of channel adapters. Nest's
// constructor injection with @Inject(CHANNEL_ADAPTERS) gives the service
// a single ChannelAdapter[] regardless of how many adapter classes are
// registered in the module. Add a new adapter → add to the providers
// array in interactions.module.ts → it shows up in the injected list.

export const CHANNEL_ADAPTERS = Symbol('CHANNEL_ADAPTERS');
export type { ChannelAdapter };
