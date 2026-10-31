// Inert Supabase client for the harness. Every query resolves to empty data and no
// request ever leaves the page, so the real components render from fixtures only.
const empty = { data: null, error: null }
const chain = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === 'then') return (resolve) => resolve(empty)
    return chain
  },
  apply() { return chain },
})
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: () => chain,
  rpc: () => chain,
  storage: { from: () => chain },
  channel: () => chain,
  removeChannel() {},
}
export default supabase
export async function getAccessToken() { return null }
