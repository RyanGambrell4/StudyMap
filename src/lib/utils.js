import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Wraps fetch with one retry on 5xx responses, using a short exponential backoff.
// Use for AI API calls that can transiently fail under load.
export async function fetchWithRetry(url, options = {}, { retries = 1, baseDelayMs = 800 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options)
    if (res.ok || res.status < 500 || attempt === retries) return res
    await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
  }
}
