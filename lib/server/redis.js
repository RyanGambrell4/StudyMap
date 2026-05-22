// npm install @upstash/redis
// Env vars needed: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

let _redis = null

function getRedis() {
  if (_redis) return _redis
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null

  // Minimal Upstash REST client — no SDK needed, uses fetch
  _redis = {
    async get(key) {
      const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      return data.result
    },
    async set(key, value, exSeconds) {
      const url2 = exSeconds
        ? `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${exSeconds}`
        : `${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`
      const res = await fetch(url2, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.json()
    },
    async incr(key) {
      const res = await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      return data.result
    },
    async expire(key, seconds) {
      const res = await fetch(`${url}/expire/${encodeURIComponent(key)}/${seconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.json()
    },
  }
  return _redis
}

export { getRedis }
