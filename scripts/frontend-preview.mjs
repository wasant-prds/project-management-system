import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { previewResponse } from '../tests/frontend-ui/preview-fixtures.mjs'

/** Isolated browser QA: production UI + explicit synthetic boundaries; no .env/DB/auth credentials. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('tsx/package.json'))('esbuild')
const postcss = require('postcss')
const tailwind = require('@tailwindcss/postcss')
const fixturePath = resolve(root, 'tests/frontend-ui/preview-fixtures.mjs').replaceAll('\\', '/')
const bundle = await esbuild.build({
  absWorkingDir: root, entryPoints: ['tests/frontend-ui/preview-entry.tsx'], bundle: true, write: false,
  platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'isolated-preview-boundaries', setup(build) {
    const boundaries = {
      'next/link': 'export default function Link({href, children, ...props}) { return <a href={href} {...props}>{children}</a> }',
      'next/navigation': 'export const usePathname = () => window.location.pathname; export const useSearchParams = () => new URLSearchParams(window.location.search); export const useRouter = () => ({push: (url) => window.location.assign(url), replace: (url) => window.history.replaceState(null, "", url), refresh: () => window.location.reload()});',
      '@/lib/owner': 'export const getOwner = () => ({id: "owner-preview"});',
      '@/lib/dashboard': `import {dashboard} from ${JSON.stringify(fixturePath)}; export const getDashboardSummary = () => dashboard; export class DashboardQueryError extends Error {}`,
      '@/components/layout/owner-settings-provider': `import {settings} from ${JSON.stringify(fixturePath)}; export const useOwnerSettings = () => ({settings, isLoading: false, loadError: null, isSavingProfile: false, isSavingPreferences: false, reload() {}, async saveProfile() {throw new Error("Preview ไม่บันทึกข้อมูล")}, async savePreferences() {throw new Error("เปลี่ยน theme ผ่าน URL ?theme=dark หรือ special-dark")}});`,
    }
    build.onResolve({ filter: /^(next\/link|next\/navigation|@\/lib\/(owner|dashboard)|@\/components\/layout\/owner-settings-provider)$/ }, (args) => ({ path: args.path, namespace: 'preview-boundary' }))
    build.onResolve({ filter: /^\.\/owner-settings-provider$/ }, () => ({ path: '@/components/layout/owner-settings-provider', namespace: 'preview-boundary' }))
    build.onLoad({ filter: /.*/, namespace: 'preview-boundary' }, (args) => ({ contents: boundaries[args.path], loader: 'tsx', resolveDir: root }))
    build.onLoad({ filter: /app[\\/]page\.tsx$/ }, async (args) => {
      const original = await readFile(args.path, 'utf8')
      const contents = original.replace('async function DashboardContent', 'function DashboardContent').replace('await searchParams', 'searchParams').replace('await getOwner()', 'getOwner()').replace('await getDashboardSummary', 'getDashboardSummary')
      return { contents, loader: 'tsx', resolveDir: dirname(args.path) }
    })
  } }],
})
const stylesheet = await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })
const html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PMS — isolated frontend preview</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname === '/preview.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].contents); return }
  if (url.pathname === '/preview.css') { response.setHeader('Content-Type', 'text/css'); response.end(stylesheet.css); return }
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return }
  if (url.pathname.startsWith('/api/')) {
    const result = previewResponse(url, request.method)
    response.writeHead(result.status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result.value)); return
  }
  response.setHeader('Content-Type', 'text/html'); response.end(html)
})
server.listen(3791, '127.0.0.1', () => console.log('Isolated UI preview: http://127.0.0.1:3791 — synthetic data, writes rejected, no .env or database'))
