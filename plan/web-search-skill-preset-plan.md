# Web Search Skill 与预制问题替换实现方案

目标：把当前特色不明显的 `smart-translator` skill 替换为一个简单的网络搜索 skill，并将预制问题从翻译场景改成网络搜索场景：`使用网络搜索：“历史上最牛的10支股票”`。

## 1. 当前现状

相关文件：

- `.agents/skills/smart-translator/SKILL.md`
- `.claude/skills/smart-translator/SKILL.md`
- `agents/chat/index.ts`
- `agents/chat/_stream.ts`
- `src/i18n/zh.ts`
- `src/i18n/en.ts`
- `src/components/ChatInput.tsx`

当前问题：

1. `smart-translator` 只是翻译提示词，展示效果比较普通。
2. 前端预制问题目前是：
   - 中文：`用 smart-translator skill 翻译成英文：EdgeOne Makers Agent 帮助开发者快速构建 AI Agent 应用。`
   - 英文：`Use smart-translator skill to translate into Chinese: EdgeOne Makers Agent helps developers quickly build AI Agent apps.`
3. `agents/chat/_stream.ts` 里的 `PROJECT_SKILLS` 仍然登记的是 `smart-translator`。
4. 项目里同时存在 `.agents/skills` 和 `.claude/skills`，为避免运行时读取路径不一致，两个目录下的 skill 内容需要保持同步。

## 2. 新 Skill 设计

建议新 skill 名称：`web-search`

目录：

```text
.agents/skills/web-search/SKILL.md
.claude/skills/web-search/SKILL.md
```

可以删除或不再使用旧目录：

```text
.agents/skills/smart-translator/
.claude/skills/smart-translator/
```

如果希望改动最小，也可以复用旧目录名，但不推荐。因为 `smart-translator` 名称和网络搜索能力不匹配，后续维护容易混淆。

## 3. Skill 内容草案

`SKILL.md` 建议写成简单、明确、容易触发的形式：

```md
---
name: web-search
description: Use this skill when the user asks to search the web, look up current information, gather sources, compare recent facts, or answer questions that require external web information. Trigger on phrases such as 网络搜索, 搜索一下, 查一下, 最新, 资料来源, web search, search the web.
---

# Web Search

## Instructions

When this skill is used:

1. Use the available web/search or browser tool to gather information from the web.
2. Prefer multiple credible sources when the question asks for facts, rankings, history, market data, or comparisons.
3. Summarize findings clearly instead of dumping raw search results.
4. Include source names or URLs when available.
5. If data may vary by time, mention the query time or that results are time-sensitive.
6. Do not invent sources, numbers, rankings, or citations.

## Output Format

Return:

```md
## Search Summary

...

## Key Findings

- ...

## Sources

- ...
```

If no reliable source is found, say so directly and suggest a refined query.
```

说明：

- 这个 skill 本身不实现搜索 API，只负责告诉 Agent 在搜索类问题中使用可用的 web/search/browser 工具。
- EdgeOne Makers 平台提供了网络搜索工具，可以直接使用。
- 如果后续接入正式搜索 API，再把该 API 暴露成 MCP/tool，并在 skill 中指定优先调用该工具。

## 4. 后端展示与 Skill 元数据更新

更新 `agents/chat/_stream.ts` 中的 `PROJECT_SKILLS`：

- `name`: 从 `smart-translator` 改为 `web-search`
- `label`: 从 `智能翻译` 改为 `网络搜索`
- `description`: 改为网络搜索说明

建议：

```ts
const PROJECT_SKILLS = [
  {
    name: 'web-search',
    label: '网络搜索',
    description: 'Use web/search or browser tools to gather current external information and summarize findings with sources.',
  },
];
```

这样前端收到 skill 可用/加载相关 SSE 事件时，展示名称会和新能力一致。

## 5. 预制问题替换

更新 `src/i18n/zh.ts`：

```ts
"preset.skill.smartTranslator": "使用网络搜索：“历史上最牛的10支股票”",
"skill.smartTranslator": "网络搜索",
```

更推荐顺手重命名 key，避免继续保留 `smartTranslator`：

```ts
"preset.skill.webSearch": "使用网络搜索：“历史上最牛的10支股票”",
"skill.webSearch": "网络搜索",
```

同时更新 `src/i18n/en.ts`：

```ts
"preset.skill.webSearch": "Use web search: \"the 10 greatest stocks in history\"",
"skill.webSearch": "Web Search",
```

更新 `src/components/ChatInput.tsx`：

```ts
const PRESET_KEYS = ['preset.1', 'preset.2', 'preset.4', 'preset.skill.webSearch'] as const;
```

如果希望最小改动，也可以不改 key，只改文案；但从维护角度建议改成 `webSearch`。

## 6. Agent 触发策略

当前 `agents/chat/index.ts` 已配置：

```ts
skills: "all"
```

因此新 skill 放到项目 skill 目录后，理论上会被 Claude SDK 发现。

为了更容易触发，可以在新 skill 的 `description` 中明确写入触发词：

- `网络搜索`
- `搜索`
- `查一下`
- `最新`
- `web search`
- `search the web`

预制问题使用：

```text
使用网络搜索：“历史上最牛的10支股票”
```

这能直接命中 `网络搜索` 触发词。

## 7. 推荐实施顺序

1. 新建 `web-search` skill：
   - `.agents/skills/web-search/SKILL.md`
   - `.claude/skills/web-search/SKILL.md`
2. 删除或废弃旧的 `smart-translator` skill 目录。
3. 更新 `agents/chat/_stream.ts` 的 `PROJECT_SKILLS`。
4. 更新 `src/i18n/zh.ts` 和 `src/i18n/en.ts` 的预制问题与 skill 名称。
5. 更新 `src/components/ChatInput.tsx` 的 preset key。
6. 本地运行 `edgeone makers dev` 验证：
   - 页面预制问题显示为 `使用网络搜索：“历史上最牛的10支股票”`
   - 点击后 Agent 能加载 `web-search` skill
   - Agent 会调用可用的 web/search/browser 工具获取信息
   - Trace 面板能看到 tool/skill 相关事件

## 8. 验收标准

- 页面不再出现 `smart-translator` 相关预制问题。
- 新预制问题显示为：`使用网络搜索：“历史上最牛的10支股票”`。
- 点击预制问题后，请求内容正确发送到 `/chat`。
- Agent 能识别这是网络搜索任务，并尝试使用可用的网络访问工具。
- SSE/Trace 面板能看到相关 skill 或工具调用事件。
- 中英文语言切换下，预制问题和 skill label 都合理展示。

## 9. 注意事项

- 如果当前 EdgeOne runtime 没有真正的 `web_search` 工具，skill 不能凭空创造搜索能力，只能引导 Agent 使用已有 `browser` 工具访问搜索结果或网页。
- 如果希望搜索体验稳定，后续最好单独接入一个搜索 MCP/tool，例如 `web_search`，再把它加入 `allowedTools` 或 MCP server。
- 不建议继续保留 `smart-translator` 名称做网络搜索，否则日志、UI、skill 事件都会产生语义混乱。
