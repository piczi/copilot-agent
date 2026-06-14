import path from 'node:path'

export function getAllowedRoots(): string[] {
  const appRoot = process.env.APP_ROOT || process.cwd()
  return [path.resolve(process.cwd()), path.resolve(appRoot)]
}

export function resolveAllowedPath(inputPath = '.'): { ok: true; absolutePath: string } | { ok: false; reason: string } {
  const allowedRoots = getAllowedRoots()
  const absolutePath = path.resolve(inputPath.trim() || '.')
  const isAllowed = allowedRoots.some((root) => absolutePath === root || absolutePath.startsWith(root + path.sep))
  if (!isAllowed) {
    return { ok: false, reason: '路径不在允许的工作区范围内' }
  }
  return { ok: true, absolutePath }
}

export function resolveCommandCwd(cwd?: string): { ok: true; cwd: string } | { ok: false; reason: string } {
  const appRoot = process.env.APP_ROOT || process.cwd()
  const requested = path.resolve(cwd || process.cwd())
  const allowedRoots = [path.resolve(process.cwd()), path.resolve(appRoot)]
  const isAllowed = allowedRoots.some((root) => requested === root || requested.startsWith(root + path.sep))

  if (!isAllowed) {
    return { ok: false, reason: '命令工作目录不在允许范围内' }
  }
  return { ok: true, cwd: requested }
}
