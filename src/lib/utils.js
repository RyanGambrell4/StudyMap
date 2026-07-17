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

// Maps HTTP status / caught error to a specific, actionable user message.
export function aiErrorMessage(statusOrError, serverMessage) {
  if (serverMessage && typeof serverMessage === 'string' && !serverMessage.toLowerCase().includes('internal')) {
    return serverMessage
  }
  const status = typeof statusOrError === 'number' ? statusOrError : null
  if (status === 401) return 'Session expired. Refresh the page and try again.'
  if (status === 403) return 'You do not have permission to use this feature.'
  if (status === 429) return 'Too many requests. Wait a moment before trying again.'
  if (status === 524 || status === 504) return 'The AI took too long. Try a shorter or simpler prompt.'
  if (status >= 500) return 'Server hiccup. We already retried once -- please try again in a few seconds.'
  if (statusOrError instanceof TypeError && statusOrError.message.includes('fetch')) {
    return 'No network connection. Check your internet and try again.'
  }
  return 'Something went wrong. Please try again.'
}
