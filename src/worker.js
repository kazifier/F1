export default {
  async fetch(request, env, ctx) {
    // Forward all requests to the ASSETS binding
    // The ASSETS binding will serve the Vite/React SPA assets
    return env.ASSETS.fetch(request)
  }
}