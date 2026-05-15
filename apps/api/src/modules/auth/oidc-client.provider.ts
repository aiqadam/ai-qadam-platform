import { Logger, type Provider } from '@nestjs/common';
import { type Client, Issuer } from 'openid-client';
import { env } from '../../config/env';

// NestJS DI token for the openid-client `Client`. Lives in this module's
// scope only — no other module needs to talk to Authentik directly.
export const OIDC_CLIENT = Symbol('OIDC_CLIENT');

// Async factory: discovers Authentik at boot via OIDC well-known endpoint.
// If Authentik is unreachable, the API refuses to start (fail-fast — auth
// must be available for the service to do its job).
export const oidcClientProvider: Provider<Client> = {
  provide: OIDC_CLIENT,
  useFactory: async (): Promise<Client> => {
    const logger = new Logger('OIDCClient');
    logger.log(`Discovering OIDC issuer at ${env.OIDC_ISSUER_URL}`);
    const issuer = await Issuer.discover(env.OIDC_ISSUER_URL);
    logger.log(`Issuer ready: ${issuer.metadata.issuer}`);
    return new issuer.Client({
      client_id: env.OIDC_CLIENT_ID,
      client_secret: env.OIDC_CLIENT_SECRET,
      redirect_uris: [env.OIDC_REDIRECT_URI],
      response_types: ['code'],
    });
  },
};
