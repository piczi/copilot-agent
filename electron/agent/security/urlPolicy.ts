import dns from 'node:dns/promises'
import net from 'node:net'

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google',
  'metadata'
])

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
    return true
  }
  if (parts[0] === 10) return true
  if (parts[0] === 127) return true
  if (parts[0] === 0) return true
  if (parts[0] === 169 && parts[1] === 254) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  if (parts[0] === 192 && parts[1] === 168) return true
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true
  return false
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('fe80:')) return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    if (net.isIP(mapped) === 4) {
      return isPrivateIpv4(mapped)
    }
  }
  return false
}

export function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip)
  if (version === 4) return isPrivateIpv4(ip)
  if (version === 6) return isPrivateIpv6(ip)
  return true
}

export function validateFetchUrl(urlString: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let parsed: URL
  try {
    parsed = new URL(urlString.trim())
  } catch {
    return { ok: false, reason: 'URL 格式无效' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: '仅支持 http 和 https 协议' }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URL 不允许包含用户名或密码' }
  }

  const hostname = parsed.hostname.toLowerCase()
  if (!hostname) {
    return { ok: false, reason: 'URL 缺少有效主机名' }
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    return { ok: false, reason: '不允许访问该主机' }
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { ok: false, reason: '不允许访问内网或本地地址' }
    }
    return { ok: true, url: parsed }
  }

  return { ok: true, url: parsed }
}

export async function resolveAndValidateHost(hostname: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (net.isIP(hostname)) {
    return isPrivateIp(hostname)
      ? { ok: false, reason: '不允许访问内网或本地地址' }
      : { ok: true }
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true })
    if (addresses.length === 0) {
      return { ok: false, reason: '无法解析域名' }
    }
    for (const address of addresses) {
      if (isPrivateIp(address.address)) {
        return { ok: false, reason: '域名解析到内网或本地地址，已阻止' }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, reason: '无法解析域名' }
  }
}

export function fetchUrlNeedsApproval(mode: 'restricted' | 'dangerous'): boolean {
  return mode === 'restricted'
}

export function getFetchUrlApprovalReason(url: string): string {
  return `该网络请求需要用户审批：${url}`
}
