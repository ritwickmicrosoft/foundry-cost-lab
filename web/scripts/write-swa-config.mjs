import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const config = {
  routes: [
    { route: '/.auth/login/github', statusCode: 404 },
    { route: '/.auth/login/twitter', statusCode: 404 },
    { route: '/api/health', methods: ['GET'], allowedRoles: ['anonymous'] },
    { route: '/forbidden.html', allowedRoles: ['anonymous'] },
    { route: '/request-access.html', allowedRoles: ['authenticated'] },
    { route: '/access-request.js', allowedRoles: ['authenticated'] },
    { route: '/favicon.svg', allowedRoles: ['authenticated'] },
    {
      route: '/api/access/request',
      methods: ['GET', 'POST'],
      allowedRoles: ['authenticated'],
    },
    {
      route: '/api/access/requests*',
      methods: ['GET', 'POST'],
      allowedRoles: ['costlab-admin'],
    },
    {
      route: '/api/comparison/explain',
      methods: ['GET', 'POST'],
      allowedRoles: ['costlab-user'],
    },
    {
      route: '/sw.js',
      allowedRoles: ['costlab-user'],
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Service-Worker-Allowed': '/',
      },
    },
    {
      route: '/manifest.webmanifest',
      allowedRoles: ['costlab-user'],
      headers: { 'Cache-Control': 'private, max-age=3600' },
    },
    { route: '/*', allowedRoles: ['costlab-user'] },
  ],
  responseOverrides: {
    401: {
      redirect: '/.auth/login/aad?post_login_redirect_uri=.referrer',
      statusCode: 302,
    },
    403: {
      rewrite: '/request-access.html',
      statusCode: 403,
    },
  },
  navigationFallback: {
    rewrite: '/index.html',
    exclude: [
      '/api/*',
      '/.auth/*',
      '/assets/*',
      '/*.{css,js,png,jpg,jpeg,gif,svg,ico,json,webmanifest}',
    ],
  },
  globalHeaders: {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  },
}

const outputDirectory = path.join(projectDirectory, 'dist')
await mkdir(outputDirectory, { recursive: true })
await writeFile(
  path.join(outputDirectory, 'staticwebapp.config.json'),
  `${JSON.stringify(config, null, 2)}\n`,
  'utf8',
)