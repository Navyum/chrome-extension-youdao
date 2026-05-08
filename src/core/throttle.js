import { THROTTLE, i18n } from './constants.js';

let lastRequestTime = 0;

export async function throttledFetch(url, options = {}) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < THROTTLE.requestInterval) {
    await sleep(THROTTLE.requestInterval - elapsed);
  }
  lastRequestTime = Date.now();

  let lastError;
  for (let attempt = 0; attempt <= THROTTLE.retryMax; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const delay = THROTTLE.retryBaseDelay * Math.pow(2, attempt) + 5000;
        console.warn(`Rate limited, waiting ${delay}ms before retry`);
        await sleep(delay);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new AuthError(i18n('authRequired'));
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      lastError = err;
      if (attempt < THROTTLE.retryMax) {
        const delay = THROTTLE.retryBaseDelay * Math.pow(2, attempt);
        console.warn(`Request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, err.message);
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
