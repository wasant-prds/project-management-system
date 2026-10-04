import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, dirname, basename, join } from 'node:path'
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
  platform: 'browser', format: 'esm', splitting: true, outdir: 'preview-build', entryNames: 'preview', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'isolated-preview-boundaries', setup(build) {
    const boundaries = {
      'next/link': 'export default function Link({href, children, ...props}) { return <a href={href} {...props}>{children}</a> }',
      'next/navigation': 'export const usePathname = () => window.location.pathname; export const useSearchParams = () => new URLSearchParams(window.location.search); export const useRouter = () => ({push: (url) => window.location.assign(url), replace: (url) => window.history.replaceState(null, "", url), refresh: () => window.location.reload()});',
      '@/lib/owner': 'export const getOwner = () => ({id: "owner-preview"});',
      '@/lib/dashboard': `import {previewData} from ${JSON.stringify(fixturePath)}; export const getDashboardSummary = () => previewData(new URLSearchParams(window.location.search).get('qa')).dashboard; export class DashboardQueryError extends Error {}`,
      '@/components/layout/owner-settings-provider': `import {previewData} from ${JSON.stringify(fixturePath)}; import {useTheme} from 'next-themes'; export const useOwnerSettings = () => { const {setTheme} = useTheme(); return ({settings: previewData(new URLSearchParams(window.location.search).get('qa')).settings, isLoading: false, loadError: null, isSavingProfile: false, isSavingPreferences: false, reload() {}, async saveProfile() {throw new Error("Preview ไม่บันทึกข้อมูล")}, async savePreferences(preferences) {if(new URLSearchParams(window.location.search).get("themeSwitch") === "1") {setTheme(preferences.theme); return} throw new Error("เปลี่ยน theme ผ่าน URL ?theme=dark หรือ special-dark")}}) };`,
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
// Native browser ESM caches failed imports. Use Next's installed Webpack runtime so
// failed chunk requests and retries behave as they do in the production build.
const scratchRoot = resolve(root, '.next')
await mkdir(scratchRoot, { recursive: true })
const scratch = await mkdtemp(join(scratchRoot, 'performance-preview-'))
const assets = new Map()
try {
  for (const file of bundle.outputFiles) {
    const source = new TextDecoder().decode(file.contents).replace(/import\("\.\/([^"/]+)\.js"\)/g,
      (_match, name) => `import(/* webpackChunkName: "${name}" */ "./${name}.js")`)
    await writeFile(join(scratch, basename(file.path)), source)
  }
  const runtime = require('next/dist/compiled/webpack/webpack')
  runtime.init()
  const compiler = runtime.webpack({
    mode: 'development', target: 'web', devtool: false,
    entry: join(scratch, 'preview.js'),
    module: { rules: [{ test: /\.js$/, type: 'javascript/auto' }] },
    output: { path: join(scratch, 'output'), filename: 'preview.js', chunkFilename: '[name].js', publicPath: '/' },
    optimization: { minimize: false, splitChunks: false }, performance: { hints: false },
  })
  try {
    const stats = await new Promise((resolveStats, reject) => compiler.run((error, stats) => error ? reject(error) : resolveStats(stats)))
    if (stats.hasErrors() || stats.hasWarnings()) throw new Error(stats.toString({ all: false, errors: true, warnings: true }))
    for (const name of await readdir(join(scratch, 'output'))) assets.set(`/${name}`, await readFile(join(scratch, 'output', name)))
  } finally { await new Promise((resolveClose, reject) => compiler.close((error) => error ? reject(error) : resolveClose())) }
} finally {
  // Remove only the uniquely created build scratch directory under this workspace's .next.
  if (dirname(resolve(scratch)) !== scratchRoot || !basename(scratch).startsWith('performance-preview-')) throw new Error('Unsafe preview scratch path')
  await rm(scratch, { recursive: true, force: true })
}
const stylesheet = await postcss([tailwind()]).process(await readFile(resolve(root, 'app/globals.css'), 'utf8'), { from: resolve(root, 'app/globals.css') })
const html = '<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PMS — isolated frontend preview</title><link rel="stylesheet" href="/preview.css"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>'
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  const url = new URL(request.url, 'http://127.0.0.1')
  if (assets.has(url.pathname)) { response.setHeader('Content-Type', 'text/javascript'); response.end(assets.get(url.pathname)); return }
  if (url.pathname === '/preview.css') { response.setHeader('Content-Type', 'text/css'); response.end(stylesheet.css); return }
  if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return }
  if (url.pathname.startsWith('/api/')) {
    const mode = new URL(request.headers.referer ?? '/', 'http://127.0.0.1').searchParams.get('qa')
    const result = request.method === 'GET' && mode === 'error'
      ? { status: 503, value: { error: { code: 'PREVIEW_UNAVAILABLE', message: 'จำลอง load failure สำหรับตรวจ error/retry UI' } } }
      : previewResponse(url, request.method, mode)
    const send = () => {
      if (response.destroyed) return
      response.writeHead(result.status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(result.value))
    }
    if (request.method === 'GET' && mode === 'slow') setTimeout(send, 1500)
    else send()
    return
  }
  response.setHeader('Content-Type', 'text/html'); response.end(html)
})
const port = Number(process.env.PMS_PREVIEW_PORT || 3791)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid preview port')
server.listen(port, '127.0.0.1', () => console.log(`Isolated UI preview: http://127.0.0.1:${port} — synthetic data, writes rejected, no .env or database`))
