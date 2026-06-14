import { weatherTool } from './weather'
import { cryptoTool } from './crypto'
import { goldTool } from './gold'
import { exchangeRateTool } from './exchange-rate'
import { renderVisualTool } from './render-visual'
import { readFileTool } from './read-file'
import { listDirectoryTool } from './list-directory'
import { execBashTool } from './exec-bash'

export const ALL_TOOLS = [
  weatherTool,
  cryptoTool,
  goldTool,
  exchangeRateTool,
  renderVisualTool,
  readFileTool,
  listDirectoryTool,
  execBashTool
]
