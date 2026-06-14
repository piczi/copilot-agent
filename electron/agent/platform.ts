export function getRuntimePlatformInstruction(): string {
  if (process.platform === 'win32') {
    return [
      '当前运行平台：Windows (process.platform=win32)。',
      '读取工作区文件或列出目录时，优先使用 read_file、list_directory，不要改用 exec_bash。',
      '需要执行其他系统命令时，必须使用 Windows PowerShell 语法，且语法必须与当前平台匹配。',
      '只读命令应使用本平台原生写法；需要多个相关字段时，优先合并为一条只读命令，而非多次分拆调用。',
      'read_file/list_directory 无法覆盖的只读需求，可使用 exec_bash。',
      '不要使用 uname、sysctl、system_profiler、ls -la 等 macOS/Linux 专属写法。'
    ].join('\n')
  }

  if (process.platform === 'darwin') {
    return [
      '当前运行平台：macOS (process.platform=darwin)。',
      '读取工作区文件或列出目录时，优先使用 read_file、list_directory，不要改用 exec_bash。',
      '需要执行其他系统命令时，必须使用 macOS/POSIX Shell 语法，且语法必须与当前平台匹配。',
      '只读命令应使用本平台原生写法；需要多个相关字段时，优先合并为一条只读命令，而非多次分拆调用。',
      'read_file/list_directory 无法覆盖的只读需求，可使用 exec_bash。',
      '不要使用 Get-CimInstance、Get-ComputerInfo、PowerShell 管道对象等 Windows 专属写法。'
    ].join('\n')
  }

  return [
    `当前运行平台：Linux (process.platform=${process.platform})。`,
    '读取工作区文件或列出目录时，优先使用 read_file、list_directory，不要改用 exec_bash。',
    '需要执行其他系统命令时，必须使用 Linux/POSIX Shell 语法，且语法必须与当前平台匹配。',
    '只读命令应使用本平台原生写法；需要多个相关字段时，优先合并为一条只读命令，而非多次分拆调用。',
    'read_file/list_directory 无法覆盖的只读需求，可使用 exec_bash。',
    '不要使用 Get-CimInstance、system_profiler 等 Windows/macOS 专属写法。'
  ].join('\n')
}
