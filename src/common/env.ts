import { cleanEnv, url } from 'envalid';

/**
 * Cleaned environment variables
 */
export const env = cleanEnv(process.env, {
  PROXY_URL: url(),
});
