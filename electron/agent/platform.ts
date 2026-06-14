export function getRuntimePlatformInstruction(): string {
  if (process.platform === 'win32') {
    return [
      '当前运行平台：Windows (process.platform=win32)。',
      '读取工作区文件或列出目录时，优先使用 read_file、list_directory，不要改用 exec_bash。',
      '需要执行其他系统命令时，必须使用 Windows PowerShell 语法，例如 Get-ComputerInfo、Select-String、Get-Location。',
      '本机诊断、系统信息等 read_file/list_directory 无法覆盖的只读需求，可使用 exec_bash 尝试验证。',
      '不要使用 uname、sysctl、system_profiler、ls -la 等 macOS/Linux 专属写法来判断本机信息。'
    ].join('\n')
  }

  if (process.platform === 'darwin') {
    return [
      '当前运行平台：macOS (process.platform=darwin)。',
      '读取工作区文件或列出目录时，优先使用 read_file、list_directory，不要改用 exec_bash。',
      '需要执行其他系统命令时，必须使用 macOS/POSIX Shell 语法，例如 uname、sysctl、system_profiler、pwd。',
      '本机诊断、系统信息等 read_file/list_directory 无法覆盖的只读需求，可使用 exec_bash 尝试验证。',
      '不要使用 Get-CimInstance、Get-ComputerInfo、PowerShell 管道对象等 Windows 专属写法来判断本机信息。'
    ].join('\n')
  }

  return [
    `当前运行平台：Linux (process.platform=${process.platform})。`,
    '读取工作区文件或列出目录时，优先使用 read_file、list_directory，不要改用 exec_bash。',
    '需要执行其他系统命令时，必须使用 Linux/POSIX Shell 语法，例如 uname、lscpu、free、df、pwd。',
    '本机诊断、系统信息等 read_file/list_directory 无法覆盖的只读需求，可使用 exec_bash 尝试验证。',
    '不要使用 Get-CimInstance、system_profiler 等其他平台专属写法来判断本机信息。'
  ].join('\n')
}
