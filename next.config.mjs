import { execSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import NextBundleAnalyzer from '@next/bundle-analyzer'
import { codeInspectorPlugin } from 'code-inspector-plugin'
// 新增：引入 Cloudflare Pages Adapter
import { withPages } from '@cloudflare/next-on-pages'

process.title = 'Shiro (NextJS)'

const env = config().parsed || {}
const isProd = process.env.NODE_ENV === 'production'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let commitHash = ''
let commitUrl = ''
const repoInfo = getRepoInfo()

if (repoInfo) {
  commitHash = repoInfo.hash
  commitUrl = repoInfo.url
}

/** @type {import('next').NextConfig} */
let nextConfig = {
  env: {
    COMMIT_HASH: commitHash,
    COMMIT_URL: commitUrl,
  },
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  output: 'standalone',
  assetPrefix: isProd ? env.ASSETPREFIX || undefined : undefined,
  compiler: {
    // reactRemoveProperties: { properties: ['^data-id$', '^data-(\\w+)-id$'] },
  },
  experimental: {
    serverMinification: true,
    webpackBuildWorker: true,
    // optimizePackageImports: ['dayjs'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; script-src 'none'; sandbox; style-src 'unsafe-inline';",
  },
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/atom.xml', destination: '/feed' },
        { source: '/feed.xml', destination: '/feed' },
        { source: '/sitemap.xml', destination: '/sitemap' },
      ],
    }
  },
  webpack: (config) => {
    config.resolve.alias['jotai'] = path.resolve(
      __dirname,
      'node_modules/jotai',
    )
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      bufferutil: 'commonjs bufferutil',
    })
    config.plugins.push(
      codeInspectorPlugin({ bundler: 'webpack', hotKeys: ['metaKey'] }),
    )
    return config
  },
}

if (process.env.ANALYZE === 'true') {
  nextConfig = NextBundleAnalyzer({ enabled: true })(nextConfig)
}

// 将 nextConfig 包裹到 Cloudflare Pages Adapter 中
export default withPages(nextConfig)

function getRepoInfo() {
  if (process.env.VERCEL) {
    const { VERCEL_GIT_PROVIDER, VERCEL_GIT_REPO_SLUG, VERCEL_GIT_REPO_OWNER } =
      process.env
    if (VERCEL_GIT_PROVIDER === 'github') {
      return {
        hash: process.env.VERCEL_GIT_COMMIT_SHA,
        url: `https://github.com/${VERCEL_GIT_REPO_OWNER}/${VERCEL_GIT_REPO_SLUG}/commit/${process.env.VERCEL_GIT_COMMIT_SHA}`,
      }
    }
  } else {
    return getRepoInfoFromGit()
  }
}

function getRepoInfoFromGit() {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD')
      .toString()
      .trim()
    const remoteName = execSync(`git config branch.${currentBranch}.remote`)
      .toString()
      .trim()
    let remoteUrl = execSync(`git remote get-url ${remoteName}`)
      .toString()
      .trim()
    const hash = execSync('git rev-parse HEAD').toString().trim()

    if (remoteUrl.startsWith('git@')) {
      remoteUrl = remoteUrl
        .replace(':', '/')
        .replace('git@', 'https://')
        .replace('.git', '')
    } else if (remoteUrl.endsWith('.git')) {
      remoteUrl = remoteUrl.slice(0, -4)
    }

    let webUrl
    if (remoteUrl.includes('github.com')) {
      webUrl = `${remoteUrl}/commit/${hash}`
    } else if (remoteUrl.includes('gitlab.com')) {
      webUrl = `${remoteUrl}/-/commit/${hash}`
    } else if (remoteUrl.includes('bitbucket.org')) {
      webUrl = `${remoteUrl}/commits/${hash}`
    } else {
      webUrl = `${remoteUrl}/commits/${hash}`
    }

    return { hash, url: webUrl }
  } catch (error) {
    console.error('Error fetching repo info:', error?.stderr?.toString())
    return null
  }
}
