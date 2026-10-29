import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { ParseError, parseIcp } from './api/_lib/parseIcp'

/**
 * Serves POST /api/parse-icp in local dev with the same code the Vercel function uses,
 * so the ICP bar works without the Python backend. Reads OLLAMA_* from frontend/.env.local.
 */
function localParseIcp(mode: string): Plugin {
  return {
    name: 'local-parse-icp',
    configureServer(server) {
      for (const [k, v] of Object.entries(loadEnv(mode, process.cwd(), 'OLLAMA_'))) process.env[k] ??= v

      server.middlewares.use('/api/parse-icp', async (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { detail: 'Method not allowed' })

        let raw = ''
        for await (const chunk of req) raw += chunk
        let prompt = ''
        try {
          prompt = String(JSON.parse(raw || '{}').prompt ?? '').trim().slice(0, 500)
        } catch {
          return send(422, { detail: 'Invalid JSON' })
        }
        if (!prompt) return send(422, { detail: 'prompt is required' })

        try {
          send(200, await parseIcp(prompt))
        } catch (e) {
          const err = e instanceof ParseError ? e : new ParseError('Unexpected error while translating.')
          send(err.status, { detail: err.message })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localParseIcp(mode)],
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
}))
