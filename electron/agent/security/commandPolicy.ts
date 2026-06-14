const WRITE_NETWORK_RISKY =
  /\b(rm|del|erase|remove-item|rmdir|rd|move|mv|copy|cp|set-content|add-content|out-file|new-item|mkdir|touch|format|shutdown|restart-computer|start-process|stop-process|invoke-expression|invoke-command|iex|icm|set-item|clear-item|curl|wget|invoke-webrequest|irm|npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install|git\s+clean|git\s+reset|git\s+checkout)\b/i

const READ_ONLY_PIPELINE_SEGMENT =
  /^(Get-(?:CimInstance|Volume|ChildItem|Content|Location|ComputerInfo|WmiObject)|Select-Object|Select\b|Where-Object|Where\b|ForEach-Object|ForEach\b|Measure-Object|Measure\b|\[pscustomobject\][^|]*|\[math\]::[\w.]+)/i

function hasStructuralRisk(command: string): boolean {
  return /[><`\n\r]/.test(command) || WRITE_NETWORK_RISKY.test(command)
}

function isReadOnlyPipelineBody(body: string): boolean {
  const trimmed = body.trim()
  if (!trimmed || /;/.test(trimmed)) return false
  if (hasStructuralRisk(trimmed)) return false

  const segments = trimmed.split('|').map((segment) => segment.trim()).filter(Boolean)
  if (segments.length === 0) return false
  return segments.every((segment) => READ_ONLY_PIPELINE_SEGMENT.test(segment))
}

function isReadOnlyScriptPart(part: string): boolean {
  const trimmed = part.trim()
  if (!trimmed) return false

  const assignmentMatch = trimmed.match(/^\$[\w]+\s*=\s*(.+)$/is)
  if (assignmentMatch) {
    return isReadOnlyPipelineBody(assignmentMatch[1])
  }

  if (/^\[pscustomobject\]/i.test(trimmed) || /^\[math\]::/i.test(trimmed)) {
    return !hasStructuralRisk(trimmed) && !/;/.test(trimmed)
  }

  return isReadOnlyPipelineBody(trimmed)
}

function isReadOnlyJsonPipeline(command: string): boolean {
  const trimmed = command.trim()
  if (!/\|\s*ConvertTo-Json(\s+-Depth\s+\d+)?$/i.test(trimmed)) return false
  const body = trimmed.replace(/\|\s*ConvertTo-Json(\s+-Depth\s+\d+)?$/i, '').trim()
  return isReadOnlyPipelineBody(body)
}

function isReadOnlySemicolonScript(command: string): boolean {
  const trimmed = command.trim()
  if (!/;/.test(trimmed)) return false
  if (hasStructuralRisk(trimmed)) return false
  const parts = trimmed.split(';').map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return false
  return parts.every((part) => isReadOnlyScriptPart(part))
}

export function isSafeReadOnlyCommand(command: string): boolean {
  const normalized = command.trim()
  if (isReadOnlyJsonPipeline(normalized)) return true
  if (isReadOnlySemicolonScript(normalized)) return true

  const safePatterns = [
    /^(pwd|dir|ls|whoami|hostname|uname|lscpu|free|df|sw_vers)(\s+[-\w./\\:=@{}'"^~]*)?$/i,
    /^sysctl\s+[-\w.]+(\s+[-\w.]+)*$/i,
    /^system_profiler\s+[-\w\s]+(\|\s*sed\s+-n\s+['"]?\d+,\d+p['"]?)?$/i,
    /^git\s+(status|log|branch|show|diff)(\s+[-\w./\\:=@{}'"^~]+)*$/i,
    /^Get-CimInstance\s+[\w.]+(\s*\|\s*Select-Object\s+[-\w\s,*@{}]+)?(\s*\|\s*ConvertTo-Json(\s+-Depth\s+\d+)?)?$/i,
    /^Get-Volume(\s+[-\w./\\:'",=(){}$@]+)*(\s*\|\s*(?:Select-Object|Where-Object|ForEach-Object)\s+[-\w\s,*@{}'"():$]+)*(\s*\|\s*ConvertTo-Json(\s+-Depth\s+\d+)?)?$/i,
    /^Get-ComputerInfo(\s*\|\s*Select-Object\s+[-\w\s,*@{}]+)?$/i,
    /^Get-ChildItem(\s+[-\w./\\:'",=(){}$]+)*$/i,
    /^Get-Content(\s+[-\w./\\:'",=(){}$]+)*$/i,
    /^Get-Location$/i,
    /^(Get-Location|Get-ChildItem|Get-Content|Get-ComputerInfo|Get-CimInstance|Select-Object|ConvertTo-Json)(\s+[-\w./\\:'",=()|{}$@]+)*$/i,
    /^echo\s+[\w\s.,:;'"()[\]{}@/#\\-]*$/i
  ]
  return safePatterns.some((pattern) => pattern.test(normalized))
}

export function commandNeedsApproval(command: string): boolean {
  const normalized = command.trim()
  if (isReadOnlyJsonPipeline(normalized) || isReadOnlySemicolonScript(normalized)) {
    return false
  }

  const riskyPattern = /[;&><`\n\r]|\b(rm|del|erase|remove-item|rmdir|rd|move|mv|copy|cp|set-content|add-content|out-file|new-item|mkdir|touch|format|shutdown|restart-computer|start-process|stop-process|invoke-expression|invoke-command|iex|icm|set-item|clear-item|curl|wget|invoke-webrequest|irm|npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install|git\s+clean|git\s+reset|git\s+checkout)\b/
  return riskyPattern.test(normalized.toLowerCase())
}

export function restrictedCommandNeedsApproval(command: string): boolean {
  return commandNeedsApproval(command) || !isSafeReadOnlyCommand(command)
}

export function getCommandApprovalReason(command: string): string {
  return commandNeedsApproval(command)
    ? '该命令包含高风险、写入、网络请求或组合命令语义，需要用户审批'
    : '该命令不在受限模式安全白名单中，需要用户审批'
}

export function truncateOutput(output: string, maxLength = 100_000): string {
  if (output.length <= maxLength) return output
  return output.slice(0, maxLength) + '\n\n[输出已截断]'
}

export function getPlatformName(): string {
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'darwin') return 'macOS'
  return 'Linux'
}
