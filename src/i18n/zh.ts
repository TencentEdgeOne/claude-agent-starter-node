const zh = {
  // Header
  "app.title": "Agent 聊天",
  "app.subtitle": "基于 EdgeOne 运行，支持沙箱工具、会话记忆和可观测性",

  // Empty state
  "empty.title": "Claude Agent Starter",
  "empty.hint": "我是运行在 EdgeOne 上的 Claude 助手。我可以调用沙箱工具、持久化会话记忆，并帮助你进行调试、文件管理、代码执行和网页浏览。",
  "empty.features": "沙箱工具 · 会话记忆 · 可观测性",

  // Chat input
  "chat.placeholder": "输入消息...  ⏎ 发送 · Shift+⏎ 换行",
  "chat.hint": "由 Claude Agent SDK + EdgeOne Sandbox 驱动 · 仅供演示",

  // Preset questions
  "preset.1": "使用终端命令检查当前系统时间和操作系统版本。",
  "preset.2": "创建 /tmp/hello.txt 并写入 \"Hello EdgeOne\"，然后读取内容。",
  "preset.3": "帮我审查聊天处理器的代码质量",
  "preset.4": "为所有 API 端点生成接口文档",

  // Tool indicators
  "tool.commands": "命令行",
  "tool.files": "文件",
  "tool.codeRunner": "代码运行",
  "tool.browser": "浏览器",

  // Debug panel
  "debug.title": "SSE 调试",
  "debug.events": "事件",
  "debug.clear": "清除",
  "debug.empty": "等待 SSE 事件...",
  "debug.emptyHint": "发送消息后，所有原始后端数据将在此处显示。",

  // Status & errors
  "status.error": "请求失败，请检查后端服务是否正常运行。",
  "status.stopped": "⏹ *已停止生成*",
  "status.backendError": "后端中止请求失败，服务器可能仍在运行。",

  // Language toggle
  "lang.switch": "English",
} as const;

export default zh;
