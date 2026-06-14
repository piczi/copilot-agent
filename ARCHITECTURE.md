# Copilot Agent 架构说明

本文档记录 LangChain.js 重构后的项目架构，供后续迭代参考。与 Cursor 规则 [`.cursor/rules/agent-architecture.mdc`](.cursor/rules/agent-architecture.mdc) 配合使用。

## 1. 设计原则

| 原则 | 说明 |
|------|------|
| 主进程中心化 Agent | API Key、工具执行、命令安全、文件访问均在 Electron 主进程 |
| 渲染进程纯 UI | React + Zustand 负责展示与交互，不直接调用 LLM 或 Node API |
| 工具契约不进 SYSTEM_PROMPT | 工具名、schema、数据映射写在 LangChain tool `description` + Zod |
| 受控可视化 | 图表/卡片通过 `render_visual` 输出 ` ```visual:type ` 围栏，UI 解析渲染 |
| 单一类型来源 | 共享契约在 `src/shared/`，避免 main/renderer 重复定义 |

## 2. 进程与数据流

```
用户输入 (InputArea)
  → useSendMessage (Zustand 更新 UI)
  → executeAgentStream (src/agent/index.ts)
  → preload: chatCompletionStream({ conversationId, message, mode })
  → IPC: electron/ipc/chat.ts
  → runAgentStream (electron/agent/stream-adapter.ts)
  → LangGraph StateGraph (electron/agent/graph.ts)
      prefetch → agent ⇄ tools
  → SqliteSaver checkpointer (thread_id = conversationId)
  → IPC 流事件: thinking / text / replace_text / approval_required / done / error
  → MessageItem → parseMessage → VisualRenderer
```

**记忆分层：**

- **完整对话链**：LangGraph checkpointer（SQLite，`userData/agent-checkpoints.db`）
- **会话元数据**（id / title / 时间）：electron-store `conversation-index`
- **UI 消息缓存**：Zustand `conversations[].messages`（切换会话时从主进程拉取）

## 3. 目录结构

```text
electron/
  main.ts                 # 入口：窗口 + IPC 注册（~90 行）
  preload.ts              # contextBridge 暴露 electronAPI
  agent/
    graph.ts              # StateGraph: prefetch → agent ⇄ tools
    stream-adapter.ts     # runAgentStream，IPC 流式入口
    model.ts              # ChatOpenAI（OpenAI 兼容 API）
    checkpointer.ts       # SqliteSaver（失败回退 MemorySaver）
    prefetch.ts           # 天气/黄金/加密货币/汇率意图预取
    context.ts            # AgentRuntimeContext（emit、审批、visibleText）
    tools/                # 9 个 LangChain tools（Zod schema）
    security/             # 命令白名单、路径限制
    conversation-index.ts # 会话标题索引
    messages.ts           # LangChain Message ↔ UI Message 转换
  ipc/
    chat.ts               # 流式聊天、exec-command
    conversations.ts      # list/get/create/delete/touch 会话
    llm-config.ts         # LLM 配置 CRUD + 连通性测试
    store.ts              # electron-store（key 白名单）

src/
  shared/
    types.ts              # LLMConfig、Message、Conversation 等
    ipc.ts                # ChatStreamPayload、ConversationIndexEntry
    visual-types.ts       # VISUAL_TYPES 单一常量源
  agent/
    prompts/system.ts     # 行为边界（不含工具 schema）
    index.ts              # 渲染进程 Agent 桥接（传 conversationId）
    config.ts             # 设置 UI 用的 LLM 配置代理
  services/               # 外部 API（weather/crypto/gold/exchange-rate）
  components/Visuals/     # visualRegistry 映射 React 组件
  utils/parseMessage.ts   # 从 content 解析 visual 围栏块
  store/chatStore.ts      # Zustand 状态 + checkpointer 同步
```

## 4. LangGraph StateGraph

**节点：**

| 节点 | 文件 | 职责 |
|------|------|------|
| `prefetch` | `prefetch.ts` + `graph.ts` | 正则识别数据查询意图，注入预取 tool turn |
| `agent` | `graph.ts` | `ChatOpenAI.bindTools(ALL_TOOLS)`，流式输出 thinking/text |
| `tools` | `ToolNode(ALL_TOOLS)` | 统一执行 9 个工具 |

**路由：** `START → prefetch → agent → (有 tool_calls ? tools : END) → agent`（最多 `MAX_TOOL_TURNS` 轮）

**Runtime Context**（`config.configurable.agentRuntime`，不写进 prompt）：

- `emit`：向渲染进程推送 IPC 流事件
- `commandMode`：restricted / dangerous
- `visibleTextRef`：`render_visual` / `exec_bash` 追加 `replace_text`
- `requestApproval` / `runCommand`：`exec_bash` 审批与执行

## 5. 工具清单

在 `electron/agent/tools/index.ts` 的 `ALL_TOOLS` 注册：

| 工具 | 文件 | 说明 |
|------|------|------|
| `fetch_weather` | `weather.ts` | Open-Meteo 天气 |
| `fetch_crypto` | `crypto.ts` | CoinGecko / Binance |
| `fetch_gold` | `gold.ts` | Binance PAXG |
| `fetch_exchange_rate` | `exchange-rate.ts` | Frankfurter |
| `render_visual` | `render-visual.ts` | 输出 visual 围栏，触发 `replace_text` |
| `read_file` | `read-file.ts` | 工作区内只读文件 |
| `list_directory` | `list-directory.ts` | 工作区内列目录 |
| `exec_bash` | `exec-bash.ts` | 本机命令，受限模式需 IPC 审批 |

**新增工具步骤：**

1. 在 `electron/agent/tools/` 新建文件，使用 `tool()` + Zod
2. 在 `tools/index.ts` 加入 `ALL_TOOLS`
3. 若需新 visual 类型：更新 `src/shared/visual-types.ts`、`parseMessage.ts`、`Visuals/index.ts`
4. 可选：在 `prefetch.ts` 增加意图匹配
5. 补充 `tests/` 单测

## 6. IPC 契约

### 流式聊天

- 发送：`chat-completion-stream` → `{ conversationId, mode }`
- 事件通道：`chat-completion-stream:{requestId}`
- 事件类型：`thinking` | `thinking_done` | `text` | `replace_text` | `approval_required` | `done` | `error`

### 会话管理

| IPC | 说明 |
|-----|------|
| `list-conversations` | 返回会话索引 |
| `get-conversation-messages` | 从 checkpointer 提取 UI 消息 |
| `create-conversation` | 新建 thread_id |
| `delete-conversation` | 删除索引 + checkpoint |
| `touch-conversation` | 更新标题/时间 |

### Store 白名单

仅允许：`conversation-index`、`llm-config`（见 `electron/agent/constants.ts`）

## 7. 可视化协议

1. 主进程 `render_visual` → `createVisualBlock()` 生成：
   ` ```visual:line_chart\n{JSON}\n``` `
2. 通过 `replace_text` 写入 assistant `content`
3. 渲染进程 `parseMessage.ts` 解析为 `VisualBlock[]`
4. `VisualRenderer` 查 `visualRegistry` 渲染

类型常量单一来源：`src/shared/visual-types.ts`（`VISUAL_TYPES`）

## 8. 提示词策略

- **`SYSTEM_PROMPT`**（`src/agent/prompts/system.ts`）：行为边界、数据真实性、不披露内部细节、回复风格
- **平台指令**（`electron/agent/platform.ts`）：按 win32/darwin/linux 动态注入第二条 system 消息
- **工具 schema**：只在各 tool 的 `description` + Zod `.describe()` 中维护

## 9. 安全模型

- API Key 仅存主进程 electron-store
- `read_file` / `list_directory`：路径限制在 `cwd` + `APP_ROOT`
- `exec_bash`：白名单 + 风险评估，受限模式经 preload `window.confirm` 审批
- 渲染进程 `contextIsolation: true`，`nodeIntegration: false`

## 10. 依赖与测试

- **LangChain 栈**：`langchain`、`@langchain/core`、`@langchain/langgraph`、`@langchain/openai`（v1.x）
- **持久化**：`@langchain/langgraph-checkpoint-sqlite` + `better-sqlite3`（`postinstall` 执行 `electron-rebuild`）
- **测试**：`npm test`（Vitest，`tests/agent.test.ts`）

## 11. 已知取舍与后续可改进项

| 项 | 现状 | 可改进方向 |
|----|------|------------|
| `exec_bash` 审批 | runtime 回调 + preload confirm | 独立审批 UI 组件；或 LangGraph `interrupt/resume` |
| 旧会话迁移 | 仅迁移索引，不迁移 messages 到 checkpoint | 一次性导入脚本 |
| `anthropic` / `proxy` 配置 | UI 保留，底层未专用适配 | 移除或实现 `ChatAnthropic` / 代理 fetch |
| UI 消息恢复 | 从 checkpoint 提取 user/assistant 文本 | 结构化 `Message.visuals` 持久化 |
| 打包 | 开发期 SqliteSaver，需 asar unpack `.node` | electron-builder 配置 |

## 12. 验收清单（迭代后自检）

- [ ] 数据查询 + 图表、读文件/列目录、exec_bash 审批可用
- [ ] 流式 thinking/text、visual 骨架、48ms flush 正常
- [ ] 新建/切换/删除对话，重启后会话可从 SQLite 恢复
- [ ] 新工具只改 `tools/` + `index.ts`（+ visual 三处）
- [ ] `npm test` 与 `npm run build` 通过
