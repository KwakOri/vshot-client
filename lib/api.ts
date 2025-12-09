/**
 * API Utilities
 *
 * Provides helper functions for making authenticated API requests
 */

/**
 * Get API authentication headers
 * @returns Headers object with X-API-Key if configured
 */
export function getApiHeaders(): HeadersInit {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  } else {
    console.warn('[API] NEXT_PUBLIC_API_KEY not configured - requests may fail');
  }

  return headers;
}

/**
 * Get API authentication headers for multipart/form-data requests
 * @returns Headers object with X-API-Key (no Content-Type for FormData)
 */
export function getApiHeadersMultipart(): HeadersInit {
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;

  const headers: HeadersInit = {};

  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  } else {
    console.warn('[API] NEXT_PUBLIC_API_KEY not configured - requests may fail');
  }

  return headers;
}
