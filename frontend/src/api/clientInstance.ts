import { createClient } from './client.ts';

// One client for the whole app, so every screen shares one session id.
export const client = createClient();
