/**
 * Cloudflare Pages 中间件 —— 访问控制。
 *
 * 由环境变量 ACCESS_MODE 决定：
 *   'public'   任何人可访问（当前模式，站上有完整的版权与免责声明）
 *   'password' 全站 HTTP Basic 认证，密码取 SITE_PASSWORD
 *   未设置      按 'password' 处理，且缺 SITE_PASSWORD 时返回 503
 *
 * 【为什么用显式模式而不是「有没有设密码」来判断】
 * 「没设密码 = 公开」这种隐式规则，会让一次误删秘钥变成一次静默的数据泄露。
 * 显式声明意图，任何一种失误都只会导致站点不可用，而不是意外公开。
 */
const REALM = 'pyfa'

const unauthorized = (msg = 'Authentication required') =>
  new Response(msg, {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })

/** 定时比较，避免按字符逐位比较泄露信息 */
function safeEqual(a, b) {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

export async function onRequest(context) {
  const { request, env, next } = context

  if (env.ACCESS_MODE === 'public') return next()

  if (!env.SITE_PASSWORD) {
    // 宁可整站不可用，也不要因为漏配秘钥而变成公开站点
    return new Response('ACCESS_MODE is not "public" and SITE_PASSWORD is unset; refusing to serve.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Basic ')) return unauthorized()

  let decoded
  try {
    decoded = atob(auth.slice(6))
  } catch {
    return unauthorized('Malformed credentials')
  }
  const i = decoded.indexOf(':')
  const pass = i < 0 ? '' : decoded.slice(i + 1)

  if (!safeEqual(pass, env.SITE_PASSWORD)) return unauthorized('Wrong password')

  const res = await next()
  // 认证过的内容不该进公共缓存
  const out = new Response(res.body, res)
  const cc = out.headers.get('Cache-Control') ?? ''
  if (!/private|no-store/.test(cc)) {
    out.headers.set('Cache-Control', cc ? `private, ${cc}` : 'private, no-cache')
  }
  return out
}
