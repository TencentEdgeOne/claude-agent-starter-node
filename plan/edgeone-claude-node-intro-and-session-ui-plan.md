# EdgeOne Claude Node 项目前端展示改造方案

## 背景

当前项目是 `claude-agent-starter`，后端使用 Claude Agent SDK Node/TypeScript 版运行在 EdgeOne Pages Agent 环境中。本次需求与 `claude-agent-starter-python` 的前端展示改造保持一致：**不改后端运行逻辑，只调整前端首页展示内容与“Agent 自我介绍”展示文案**。

目标是让页面更清楚地表达：

1. 这是运行在 EdgeOne 环境中的 Claude 助手；
2. 它能够调用 EdgeOne 沙箱环境下的工具；
3. 它可以借助 EdgeOne Store 完成会话记忆；
4. EdgeOne 运行时会自动注入可观测能力；
5. 首页右侧除展示 tools 使用外，还在尾部补充后端 `session/store` 使用示例代码。

## 改造范围

### 仅前端

涉及文件：

- `src/App.tsx`
- `src/components/ChatWindow.tsx`
- `src/components/CodeViewer.tsx`
- `src/components/CodeViewer.module.css`

可选涉及：

- `src/components/ToolIndicators.tsx`
- `src/App.module.css`

### 不改后端

本方案不修改以下后端逻辑：

- `agents/chat/index.ts`
- `agents/history/index.ts`
- `agents/stop/index.ts`
- `SYSTEM_PROMPT`
- `onRequest()`
- `claudeSessionStore` 真实运行逻辑
- SSE 协议、Store 读写、MCP 工具桥接逻辑

后端相关代码只作为前端 `CodeViewer` 中的“展示示例”，不改变实际执行代码。

## 方案一：前端 Agent 自我介绍文案

### 目标

在首页空状态或欢迎区域展示 Agent 自我介绍，而不是修改后端 `SYSTEM_PROMPT`。

### 建议文案

```text
我是运行在 EdgeOne 环境中的 Claude 助手。
我能够调用 EdgeOne 沙箱环境下的工具，帮你执行命令、管理文件、运行代码、访问网页，并结合 EdgeOne Store 保存会话记忆。
EdgeOne 运行时还会自动接入可观测能力，帮助追踪请求、工具调用和流式输出状态。
```

### 建议展示位置

优先放在 `src/components/ChatWindow.tsx` 的空状态区域。

当前空状态：

```text
Agent 已就绪
试试问天气、穿衣建议、翻译或文本统计
```

建议改为：

```text
Claude Agent Starer已就绪
我是运行在 EdgeOne 环境中的 Claude 助手，可以调用沙箱工具、保存会话记忆，并帮助你完成调试、文件处理、代码执行和网页访问。
```

### 影响

- 只影响前端展示；
- 不影响模型实际系统提示词；
- 不影响后端接口行为。

## 方案二：首页 Header 文案优化

### 目标

让页面顶部副标题同时体现：

- Claude Agent SDK；
- EdgeOne Sandbox Tools；
- Store Memory；
- Observability。

### 涉及文件

- `src/App.tsx`

### 当前文案

```text
Powered by Claude Agent SDK + EdgeOne Sandbox
```

### 建议文案

中文版本：

```text
运行在 EdgeOne 环境中，支持沙箱工具、会话记忆与可观测
```

或中英混合版本：

```text
Claude Agent SDK · EdgeOne Sandbox Tools · Store Memory · Observability
```

### 推荐

如果当前页面整体偏中文，推荐使用：

```text
运行在 EdgeOne 环境中，支持沙箱工具、会话记忆与可观测
```

## 方案三：保留 Tools 展示，并在尾部追加 Session / Store 示例

### 目标

当前右侧 `CodeViewer` 主要展示工具接入代码。保留现有 tools 展示，在尾部追加一段后端 `session/store` 使用示例，让用户能看到 EdgeOne Store 如何用于会话记忆。

### 涉及文件

- `src/components/CodeViewer.tsx`
- `src/components/CodeViewer.module.css`

### 当前展示重点

`CodeViewer` 当前展示：

- 从 `context.tools.all()` 获取 EdgeOne 平台工具；
- 定义 `commands`、`files`、`code_interpreter`、`browser`；
- 通过 `createSdkMcpServer` 注册工具。

### 新增展示代码建议

在现有工具示例尾部追加一个新分区：

```ts
// ========== EdgeOne Store 会话记忆 ==========
const store = context.store ?? null;
const conversationId = context.conversation_id ?? '';

const claudeSessionStore =
  store?.claude_session_store?.() ?? null;

const options = {
  model: resolveModelName(),
  systemPrompt: SYSTEM_PROMPT,
  sessionStore: claudeSessionStore,
  env: collectGatewayEnv(),
};

// 保存前端可恢复的聊天记录
await store.appendMessage({
  conversationId,
  role: 'user',
  content: message,
});

await store.appendMessage({
  conversationId,
  role: 'assistant',
  content: fullAssistantText,
});
```

### 分区标题建议

在 `CodeViewer` 中增加轻量分隔，例如：

```text
// Session & Store Memory
```

或：

```text
// EdgeOne Store 会话记忆
```

### Footer 文案建议

当前 footer 可改为：

```text
Claude Agent SDK + EdgeOne Sandbox Tools + Store Memory
```

或中文：

```text
沙箱工具 · Store 会话记忆 · 自动可观测
```

## 方案四：工具灯区域文案增强

### 目标

`ToolIndicators` 当前强调“EdgeOne 平台沙箱工具”，可以补充说明这些工具会在 Agent 调用时点亮。

### 涉及文件

- `src/components/ToolIndicators.tsx`

### 当前文案

```text
EdgeOne 平台沙箱工具
```

### 建议文案

```text
EdgeOne 平台沙箱工具 · 调用时实时点亮
```

或更简洁：

```text
沙箱工具调用状态
```

## 方案五：样式调整建议

### 涉及文件

- `src/components/CodeViewer.module.css`
- 可选：`src/App.module.css`

### 需要关注

追加 session/store 示例后，右侧代码区域会更长，需要确保：

1. `CodeViewer` 支持内部滚动；
2. 工具示例和 Store 示例之间有清晰间距；
3. footer 不被代码内容挤出或遮挡；
4. 小屏幕下仍可阅读。

### 可选样式

可新增：

```css
.sectionGap
.sectionLabel
.divider
```

用于区分：

- Sandbox Tools 示例；
- Store Memory 示例。

## 建议实施顺序

1. 修改 `src/components/ChatWindow.tsx` 空状态文案，完成前端 Agent 自我介绍；
2. 修改 `src/App.tsx` header subtitle；
3. 修改 `src/components/CodeViewer.tsx`，保留 tools 展示并追加 Node 后端 session/store 示例；
4. 如展示过长，微调 `src/components/CodeViewer.module.css`；
5. 可选修改 `src/components/ToolIndicators.tsx` 的 hint 文案；
6. 执行前端构建检查：

```bash
npm run build
```

## 验收标准

完成后应满足：

1. 首页能看到清晰的 Agent 自我介绍，包含：
   - 运行在 EdgeOne 环境；
   - Claude 助手；
   - 可调用 EdgeOne 沙箱工具；
   - 支持 Store 会话记忆；
   - 自动接入可观测能力。

2. 右侧 `CodeViewer` 保留工具接入示例。

3. `CodeViewer` 尾部新增 Node 后端 `session/store` 使用示例。

4. 页面文案不再只强调 tools，也体现：
   - Sandbox Tools；
   - Store Memory；
   - Observability。

5. 不修改后端运行逻辑，以下接口行为保持不变：
   - `/chat`
   - `/history`
   - `/stop`

## 风险与注意事项

- 本次只改前端展示，不改真实后端行为；
- `CodeViewer` 中的 session/store 代码是展示示例，不直接执行；
- 不要在前端或示例代码中出现真实 API Key；
- 如果右侧代码过长，需要保证滚动体验正常；
- “可观测”建议表述为 EdgeOne 运行时能力，避免让用户理解为业务代码手动埋点。
