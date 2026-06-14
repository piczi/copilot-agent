export function isSafeReadOnlyCommand(command: string): boolean {
  const normalized = command.trim()
  const safePatterns = [
    /^(pwd|dir|ls|whoami|hostname|uname|lscpu|free|df|sw_vers)(\s+[-\w./\\:=@{}'"^~]*)?$/i,
    /^sysctl\s+[-\w.]+(\s+[-\w.]+)*$/i,
    /^system_profiler\s+[-\w\s]+(\|\s*sed\s+-n\s+['"]?\d+,\d+p['"]?)?$/i,
    /^git\s+(status|log|branch|show|diff)(\s+[-\w./\\:=@{}'"^~]+)*$/i,
    /^Get-CimInstance\s+[\w.]+(\s*\|\s*Select-Object\s+[-\w\s,*]+)?$/i,
    /^Get-ComputerInfo(\s*\|\s*Select-Object\s+[-\w\s,*]+)?$/i,
    /^Get-ChildItem(\s+[-\w./\\:'",=(){}$]+)*$/i,
    /^Get-Content(\s+[-\w./\\:'",=(){}$]+)*$/i,
    /^Get-Location$/i,
    /^(Get-Location|Get-ChildItem|Get-Content|Get-ComputerInfo|Get-CimInstance|Select-Object|ConvertTo-Json)(\s+[-\w./\\:'",=()|{}$]*)?$/i,
    /^echo\s+[\w\s.,:;'"()[\]{}@/#\\-]*$/i
  ]
  return safePatterns.some((pattern) => pattern.test(normalized))
}

export function commandNeedsApproval(command: string): boolean {
  const normalized = command.toLowerCase()
  const riskyPattern = /[;&><`\n\r]|\b(rm|del|erase|remove-item|rmdir|rd|move|mv|copy|cp|set-content|add-content|new-item|mkdir|touch|format|shutdown|restart-computer|curl|wget|invoke-webrequest|irm|npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install|git\s+clean|git\s+reset|git\s+checkout)\b/
  return riskyPattern.test(normalized)
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
