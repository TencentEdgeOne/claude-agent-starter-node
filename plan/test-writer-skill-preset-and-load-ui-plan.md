# `smart-translator` Skill 预制问题与前端加载展示方案

目标：将当前项目中不适合展示的 `test-writer` skill 替换为更简单、稳定、容易触发的 `smart-translator` skill，并为它配置一个预制问题；当后端发生 `load_skill` / skill 可用事件时，在前端页面中给用户可见反馈。

选择 `smart-translator` 的原因：

- 不依赖文件、浏览器、截图或网络；
- 用户点击预制问题后可以快速触发；
- 输出结果直观，普通用户容易理解；
- 非常适合展示 “Skill 可用 / Skill 已加载” 的前端状态；
- 失败概率低，适合作为 starter/demo 的默认 skill。

---

## 1. 当前项目现状

### 1.1 当前 Skill 需要替换

当前项目只保留了：

```txt
.claude/skills/test-writer/SKILL.md
```

原 skill：

```yaml
---
name: test-writer
description: Write unit tests and integration tests for code. Use when the user asks to add tests, write test cases, or improve test coverage.
---
```

问题：

- `test-writer` 需要读取代码、判断测试框架、生成测试文件；
- 对普通用户不够直观；
- 触发后和普通代码生成的差异不明显；
- 不适合作为 “Skill 加载展示” 的默认 demo。

建议替换为：

```txt
.claude/skills/smart-translator/SKILL.md
```

---

## 2. 推荐 Skill：`smart-translator`

### 2.1 Skill 定位

Skill 名称：

```txt
smart-translator
```

中文展示名：

```txt
智能翻译
```

定位：

```txt
在中英文之间翻译内容，同时保留语气、格式、术语、Markdown 结构和产品文案风格。
```

适合触发的用户意图：

- 翻译；
- 本地化；
- 中英文互译；
- 产品文案翻译；
- 保持 Markdown 结构的翻译；
- 技术术语准确翻译；
- 翻译并润色。

---

## 3. 推荐 `SKILL.md`

新增文件：`.claude/skills/smart-translator/SKILL.md`

删除旧文件：`.claude/skills/test-writer/SKILL.md`

推荐内容：

```md
---
name: smart-translator
description: Translate text between Chinese and English while preserving tone, formatting, terminology, and Markdown structure. Use when the user asks to translate, localize, polish bilingual content, or adapt copy for product pages.
---

# Smart Translator

## Instructions

When translating or localizing text:

1. Detect the source language automatically.
2. Translate Chinese to English, or English to Chinese, unless the user specifies another target language.
3. Preserve Markdown, lists, tables, inline code, links, placeholders, and product names.
4. Keep technical terms accurate and consistent.
5. Adapt the tone according to the user's request.
6. If the user does not specify a tone, use a clear, professional, and concise tone.
7. Do not add unrelated explanation.

## Output Format

Return:

```md
## Translation

...

## Notes

- ...
```

Only include `Notes` when there are important terminology, tone, or localization decisions.

## Rules

- Do not change product names unless explicitly requested.
- Preserve placeholders, variables, command names, API names, and code identifiers.
- Preserve Markdown structure whenever possible.
- Keep the translation natural rather than literal when product copy requires localization.
- Respond in the same language as the user unless the user asks otherwise.
```

---

## 4. 预制问题设计

### 4.1 中文预制问题

推荐使用短、稳定、容易展示的 preset：

```txt
请使用 smart-translator skill，把这句话翻译成英文，保持官网产品文案风格：EdgeOne Pages Agent 支持流式对话、工具调用和会话记忆，帮助开发者快速构建 AI Agent 应用。
```

优点：

- 明确点名 `smart-translator skill`；
- 内容短，响应快；
- 不依赖文件或工具；
- 结果容易判断好坏；
- 非技术用户也能理解。

### 4.2 英文预制问题

```txt
Use the smart-translator skill to translate this sentence into Chinese while keeping a professional landing-page tone: EdgeOne Pages Agent supports streaming chat, tool calling, and session memory, helping developers quickly build AI Agent applications.
```

### 4.3 按钮展示文案

如果希望按钮更短，前端 chip 可以展示短 label，但实际发送完整 prompt。

按钮文案：

```txt
翻译产品介绍
```

实际发送内容：

```txt
请使用 smart-translator skill，把这句话翻译成英文，保持官网产品文案风格：EdgeOne Pages Agent 支持流式对话、工具调用和会话记忆，帮助开发者快速构建 AI Agent 应用。
```

当前项目的 `ChatInput` 是直接把 i18n 文案作为发送内容，因此最小实现中按钮文案和发送内容可以先保持一致。后续如果要优化展示，可以把 `labelKey` 和 `promptKey` 拆开。

---

## 5. 前端预制问题改造方案

### 5.1 当前实现

文件：`src/components/ChatInput.tsx`

当前通过固定 key 渲染 4 个 preset chip：

```ts
const PRESET_KEYS = ['preset.1', 'preset.2', 'preset.3', 'preset.4'] as const;
```

文案在：

- `src/i18n/zh.ts`
- `src/i18n/en.ts`

### 5.2 最小改造方式

将 `PRESET_KEYS` 改为只保留一个 smart-translator preset：

```ts
const PRESET_KEYS = ['preset.skill.smartTranslator'] as const;
```

这样页面上只显示一个和当前唯一 skill 对应的预制问题，用户不会误以为还有多个 demo skill。

### 5.3 i18n 新增字段

`src/i18n/zh.ts`：

```ts
"preset.skill.smartTranslator": "请使用 smart-translator skill，把这句话翻译成英文，保持官网产品文案风格：EdgeOne Pages Agent 支持流式对话、工具调用和会话记忆，帮助开发者快速构建 AI Agent 应用。",
```

`src/i18n/en.ts`：

```ts
"preset.skill.smartTranslator": "Use the smart-translator skill to translate this sentence into Chinese while keeping a professional landing-page tone: EdgeOne Pages Agent supports streaming chat, tool calling, and session memory, helping developers quickly build AI Agent applications.",
```

### 5.4 可选：拆分按钮 label 和发送 prompt

如果希望按钮短一点，可以改造 `ChatInput`：

```ts
const PRESETS = [
  {
    labelKey: 'preset.skill.smartTranslator.label',
    promptKey: 'preset.skill.smartTranslator.prompt',
  },
] as const;
```

对应 i18n：

```ts
"preset.skill.smartTranslator.label": "翻译产品介绍",
"preset.skill.smartTranslator.prompt": "请使用 smart-translator skill，把这句话翻译成英文，保持官网产品文案风格：EdgeOne Pages Agent 支持流式对话、工具调用和会话记忆，帮助开发者快速构建 AI Agent 应用。",
```

最小实现可以先不做拆分。

---

## 6. Skill 元数据集中配置

当前只有一个 skill，可以硬编码；但为了前端展示和后端 SSE payload 一致，建议新增一个统一常量。

推荐元数据：

```ts
const PROJECT_SKILLS = [
  {
    name: 'smart-translator',
    label: '智能翻译',
    description: 'Translate text between Chinese and English while preserving tone, formatting, terminology, and Markdown structure.',
    presetKey: 'preset.skill.smartTranslator',
  },
];
```

后续如果增加更多 skill，只需要扩展这个列表。

---

## 7. 后端 `load_skill` / Skill 可用事件方案

### 7.1 区分两个概念

需要区分：

1. `skills_available`：后端告诉前端“当前项目有哪些 skill 可用”；
2. `skill_loaded`：模型实际加载/触发某个 skill 时告诉前端“正在使用 smart-translator”。

当前项目已有 `skills_loaded`：

```ts
enqueueSse(controller, encoder, 'skills_loaded', {
  skills: options.skills,
  settingSources: options.settingSources,
});
```

但这个事件只能说明 `skills: "all"`，不能告诉前端具体是 `smart-translator`。

### 7.2 推荐新增 `skills_available`

文件：`agents/chat/_stream.ts`

新增：

```ts
const PROJECT_SKILLS = [
  {
    name: 'smart-translator',
    label: '智能翻译',
    description: 'Translate text between Chinese and English while preserving tone, formatting, terminology, and Markdown structure.',
    presetKey: 'preset.skill.smartTranslator',
  },
];
```

stream 开始时发送：

```ts
enqueueSse(controller, encoder, 'skills_available', {
  skills: PROJECT_SKILLS,
});
```

建议保留原 `skills_loaded` 作为 debug 信息，同时新增 `skills_available` 给 UI 使用。

### 7.3 推荐新增 `skill_loaded`

当后端检测到 Claude SDK stream 中出现 `load_skill` / skill 工具调用时，发送：

```json
{
  "name": "smart-translator",
  "status": "loaded"
}
```

SSE：

```ts
enqueueSse(controller, encoder, 'skill_loaded', {
  name: 'smart-translator',
  status: 'loaded',
});
```

用途：前端将 `smart-translator` 指示器短暂高亮，展示 “正在使用智能翻译”。

### 7.4 如果 SDK 流中没有明确 `load_skill` 事件

不同 Claude Agent SDK 版本不一定会把真正的 `load_skill` 暴露成稳定字段。兼容策略：

1. 优先检测 SDK message 中是否有 `load_skill` tool/block；
2. 如果检测不到，只展示 `skills_available`，文案为“智能翻译 skill 已启用”；
3. 不要把 `skills_available` 误写成“正在使用”；
4. 只有检测到明确 `load_skill`，才展示“正在使用 smart-translator”。

---

## 8. 后端实现位置

### 8.1 `agents/chat/index.ts`

当前配置：

```ts
skills: "all",
settingSources: ["project"],
```

保持即可。因为 skill 存放在 `.claude/skills/smart-translator/SKILL.md`，`settingSources: ["project"]` 可以让项目级 skill 生效。

### 8.2 `agents/chat/_stream.ts`

推荐新增检测函数：

```ts
function detectLoadedSkill(msg: any): string | null {
  const blocks = msg.message?.content ?? [];
  for (const block of blocks) {
    const name = block?.name || block?.tool_name || '';
    const input = block?.input ?? {};

    if (name === 'load_skill' || name.endsWith('__load_skill')) {
      const skillName = input.skill || input.name || input.skillName;
      if (skillName === 'smart-translator') return 'smart-translator';
    }
  }
  return null;
}
```

在 stream loop 中调用：

```ts
const loadedSkill = detectLoadedSkill(msg);
if (loadedSkill) {
  enqueueSse(controller, encoder, 'skill_loaded', {
    name: loadedSkill,
    status: 'loaded',
  });
}
```

如果 DebugPanel 中看到的实际 SDK 字段不同，再根据实际 raw event 调整检测逻辑。

---

## 9. 前端 API 层改造

文件：`src/api.ts`

### 9.1 类型新增

```ts
export interface SkillInfo {
  name: string;
  label?: string;
  description?: string;
  presetKey?: string;
}

export interface SkillLoadedPayload {
  name: string;
  status: 'available' | 'loaded';
}
```

### 9.2 回调新增

```ts
export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onToolCalled: (toolName: string) => void;
  onSkillAvailable?: (skills: SkillInfo[]) => void;
  onSkillLoaded?: (payload: SkillLoadedPayload) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  onRawEvent?: (event: RawSseEvent) => void;
}
```

### 9.3 SSE switch 新增分支

```ts
case 'skills_available':
  cb.onSkillAvailable?.(parsed.skills || []);
  break;
case 'skill_loaded':
  cb.onSkillLoaded?.({ name: parsed.name, status: parsed.status || 'loaded' });
  break;
```

---

## 10. 前端 UI 展示方案

### 10.1 状态设计

在 `src/types.ts` 新增：

```ts
export interface SkillState {
  id: string;
  name: string;
  label?: string;
  description?: string;
  status: 'available' | 'loaded';
  active: boolean;
  animKey: number;
}
```

在 `App.tsx` 中新增：

```ts
const [skills, setSkills] = useState<SkillState[]>([]);
```

处理 `skills_available`：

```ts
onSkillAvailable(skillList) {
  setSkills(skillList.map(skill => ({
    id: skill.name,
    name: skill.name,
    label: skill.label,
    description: skill.description,
    status: 'available',
    active: false,
    animKey: 0,
  })));
}
```

处理 `skill_loaded`：

```ts
onSkillLoaded(payload) {
  setSkills(prev => prev.map(skill =>
    skill.id === payload.name
      ? { ...skill, status: 'loaded', active: true, animKey: skill.animKey + 1 }
      : skill
  ));

  setTimeout(() => {
    setSkills(prev => prev.map(skill =>
      skill.id === payload.name ? { ...skill, active: false } : skill
    ));
  }, 1200);
}
```

### 10.2 展示位置

推荐放在 header 右侧，和工具灯并列：

```tsx
<ToolIndicators lamps={lamps} />
<SkillIndicators skills={skills} />
```

为了改动最小，也可以复用现有 `ToolLamp` 样式，将 skill 当成一种特殊 lamp：

```ts
{
  id: 'skill:smart-translator',
  label: '智能翻译',
  icon: '译',
  active: false,
  animKey: 0,
}
```

不建议使用 emoji，避免不同系统展示不一致。可以用文字图标 `译`。

### 10.3 展示文案

未触发时：

```txt
智能翻译 · 已启用
```

实际检测到 `load_skill` 后：

```txt
正在使用 smart-translator
```

如果只实现最小 UI，可只显示：

```txt
Skill: smart-translator
```

并在 `skill_loaded` 时短暂高亮。

### 10.4 i18n 文案

`src/i18n/zh.ts`：

```ts
"skill.smartTranslator.label": "智能翻译",
"skill.smartTranslator.available": "智能翻译 skill 已启用",
"skill.smartTranslator.loaded": "正在使用 smart-translator",
```

`src/i18n/en.ts`：

```ts
"skill.smartTranslator.label": "Smart Translator",
"skill.smartTranslator.available": "smart-translator skill enabled",
"skill.smartTranslator.loaded": "Using smart-translator",
```

---

## 11. 推荐最小落地步骤

按以下顺序实现：

1. 删除 `.claude/skills/test-writer/SKILL.md`；
2. 新增 `.claude/skills/smart-translator/SKILL.md`；
3. 在 `src/i18n/zh.ts`、`src/i18n/en.ts` 新增 `preset.skill.smartTranslator`；
4. 修改 `src/components/ChatInput.tsx`，将 `PRESET_KEYS` 改成只包含 `preset.skill.smartTranslator`；
5. 在 `agents/chat/_stream.ts` 新增 `PROJECT_SKILLS`，描述 `smart-translator`；
6. stream 开始时新增 SSE `skills_available`，payload 返回 `smart-translator` 元数据；
7. 在 `src/api.ts` 增加 `onSkillAvailable` / `onSkillLoaded` 回调；
8. 在 `App.tsx` 保存 skill 状态；
9. 复用 `ToolLamp` 或新增 `SkillIndicators`，在 header 中显示 `smart-translator`；
10. 在 `_stream.ts` 尝试检测 `load_skill` 并发送 `skill_loaded`；
11. 如果 SDK 不暴露 `load_skill`，前端至少展示 `skills_available`，标记为“已启用”，不要误称“正在使用”；
12. 点击预制问题，观察 DebugPanel 中是否出现实际 `load_skill` 相关 raw event，再按实际字段补强检测函数。

---

## 12. 验证清单

### 12.1 Skill 文件

- `.claude/skills/test-writer/SKILL.md` 已删除；
- `.claude/skills/smart-translator/SKILL.md` 已新增；
- front matter 中 `name` 为 `smart-translator`；
- description 明确包含 `translate`、`localize`、`bilingual content` 等触发词。

### 12.2 预制问题

- 页面只显示一个和 `smart-translator` 相关的 preset chip；
- 点击 preset 后能发送完整翻译请求；
- 问题内容能稳定触发翻译意图；
- 中英文切换后 preset 文案正确；
- 响应速度明显快于写测试类任务。

### 12.3 Skill 可用展示

- 发起 `/chat` 后，后端发送 `skills_available`；
- 前端能显示 `smart-translator` skill；
- DebugPanel 能看到 `skills_available` 事件；
- 不出现 undefined/null 文案。

### 12.4 Skill 实际加载展示

- 如果 SDK stream 中有 `load_skill` 事件，后端能解析出 `smart-translator`；
- 前端收到 `skill_loaded` 后，`smart-translator` 指示器短暂高亮；
- 如果 SDK 没有明确 `load_skill` 事件，页面只显示“已启用”，不要显示“正在使用”。

### 12.5 回归验证

- 原有 `tool_called` 灯效不受影响；
- 原有 SSE 文本流不受影响；
- 停止生成、清空历史、调试面板仍正常；
- TypeScript 编译通过。

---

## 13. 注意事项

- 不建议前端直接读取 `.claude/skills/smart-translator/SKILL.md`，浏览器打包后不一定能访问该文件；推荐使用 i18n 或显式 skill catalog 配置。
- 不建议把 `skills: "all"` 直接展示给用户，它不是具体 skill 名。
- 如果要表达“实际 load_skill”，必须以后端 stream 中检测到的事件为准；否则只能表达“skill available/enabled”。
- 当前只有一个 skill，可以硬编码 `smart-translator`，但最好把元数据集中到一个常量，方便后续扩展。
- 翻译类 skill 不展示工具调用能力，但非常适合稳定展示 skill 加载和指示器高亮。
