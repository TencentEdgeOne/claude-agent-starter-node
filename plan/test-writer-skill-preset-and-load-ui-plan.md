# `test-writer` Skill 预制问题与前端加载展示方案

目标：当前项目只保留 `.claude/skills/test-writer/SKILL.md` 一个 skill，需要为它配置一个预制问题，并在后端发生 `load_skill` / skill 可用事件时，在前端页面中给用户可见反馈。

---

## 1. 当前项目现状

### 1.1 当前唯一 Skill

文件：`.claude/skills/test-writer/SKILL.md`

```yaml
---
name: test-writer
description: Write unit tests and integration tests for code. Use when the user asks to add tests, write test cases, or improve test coverage.
---
```

该 skill 的触发意图是：用户要求写测试、补充测试用例、提升测试覆盖率。

### 1.2 当前前端已有预制问题入口

文件：`src/components/ChatInput.tsx`

当前通过固定 key 渲染 4 个 preset chip：

```ts
const PRESET_KEYS = ['preset.1', 'preset.2', 'preset.3', 'preset.4'] as const;
```

文案在：

- `src/i18n/zh.ts`
- `src/i18n/en.ts`

### 1.3 当前后端已有 skill 配置事件

文件：`agents/chat/_stream.ts`

当前 stream 开始时会发一个 `skills_loaded` SSE 事件：

```ts
enqueueSse(controller, encoder, 'skills_loaded', {
  skills: options.skills,
  settingSources: options.settingSources,
});
```

但它现在只表达“本次 agent options 开启了 skills”，不是明确表达“哪个 skill 被加载/可用/触发”。前端目前也没有针对 `skills_loaded` 做 UI 展示。

---

## 2. 预制问题设计

### 2.1 中文预制问题

建议新增一个专门触发 `test-writer` 的预制问题：

```txt
请使用 test-writer skill，为当前项目中一个适合的 TypeScript 模块补充单元测试，并说明覆盖的正常路径、边界情况和错误路径。
```

如果希望更具体、更容易稳定触发，可以使用：

```txt
请使用 test-writer skill，为 src/lib/imageStore.ts 编写单元测试，覆盖 base64ToBlob、makeStorageKey、IndexedDB 图片存取和 object URL 管理。
```

推荐使用第二个，原因：

- 明确要求“编写单元测试”；
- 明确点名 `test-writer skill`；
- 指定目标文件，减少 agent 选择成本；
- 覆盖点和 skill 的测试编写规则匹配。

### 2.2 英文预制问题

```txt
Use the test-writer skill to write unit tests for src/lib/imageStore.ts, covering base64ToBlob, makeStorageKey, IndexedDB image persistence, and object URL management.
```

---

## 3. 前端预制问题改造方案

### 3.1 最小改造方式

继续沿用现有 `PRESET_KEYS` 机制，只新增一个 key：

```ts
const PRESET_KEYS = ['preset.skill.testWriter'] as const;
```

或者如果还要保留旧的 4 个 demo preset：

```ts
const PRESET_KEYS = ['preset.skill.testWriter', 'preset.1', 'preset.2', 'preset.3', 'preset.4'] as const;
```

因为当前用户说“项目只保留了一个 skill”，建议只展示一个和 skill 相关的 preset，避免用户误以为还有多个示例能力入口。

### 3.2 i18n 新增字段

`src/i18n/zh.ts`：

```ts
"preset.skill.testWriter": "请使用 test-writer skill，为 src/lib/imageStore.ts 编写单元测试，覆盖 base64ToBlob、makeStorageKey、IndexedDB 图片存取和 object URL 管理。",
```

`src/i18n/en.ts`：

```ts
"preset.skill.testWriter": "Use the test-writer skill to write unit tests for src/lib/imageStore.ts, covering base64ToBlob, makeStorageKey, IndexedDB image persistence, and object URL management.",
```

### 3.3 可选：将 Skill 信息集中配置

如果后续会有多个 skill，建议新增统一配置：

```ts
// src/skills.ts
export const SKILLS = [
  {
    id: 'test-writer',
    name: 'test-writer',
    labelKey: 'skill.testWriter.label',
    descriptionKey: 'skill.testWriter.description',
    presetKey: 'preset.skill.testWriter',
  },
] as const;
```

当前只有一个 skill，可以先不加，直接改 `PRESET_KEYS` 即可。

---

## 4. 后端 `load_skill` / Skill 可用事件方案

### 4.1 区分两个概念

需要区分：

1. `skills_loaded`：后端告诉前端“本次会话启用了哪些 skill 配置/有哪些 skill 可用”；
2. `skill_loaded` 或 `load_skill`：模型实际加载/触发某个 skill 时告诉前端“正在使用 test-writer”。

当前项目只有第 1 种，而且 payload 还比较抽象：

```json
{
  "skills": "all",
  "settingSources": ["project"]
}
```

前端无法直接知道具体是 `test-writer`。

### 4.2 推荐 SSE 事件设计

新增两个事件：

#### `skills_available`

stream 开始时发送，表示项目可用 skill 列表：

```json
{
  "skills": [
    {
      "name": "test-writer",
      "description": "Write unit tests and integration tests for code.",
      "presetKey": "preset.skill.testWriter"
    }
  ]
}
```

用途：前端初始化时展示 “Skill 可用”。

#### `skill_loaded`

当后端检测到 SDK 流里发生 `load_skill` / skill 工具调用时发送：

```json
{
  "name": "test-writer",
  "status": "loaded"
}
```

用途：前端在页面中高亮展示 “已加载 test-writer”。

### 4.3 如果 SDK 流中没有明确 `load_skill` 事件

不同 Claude Agent SDK 版本可能不会把真正的 `load_skill` 暴露成稳定字段。建议做兼容策略：

1. 优先检测 SDK message 中的 tool/block 名称是否为 `load_skill`，且参数里包含 `test-writer`；
2. 如果没有明确事件，则在 stream 开始时发送 `skills_available`；
3. 当前项目只有一个 skill 时，可以把 `skills_available` 展示为“test-writer skill 已启用”，但不要误写成“已被模型实际调用”；
4. 只有检测到明确 `load_skill` 时，才展示“已加载/正在使用 test-writer”。

---

## 5. 后端实现位置

### 5.1 `agents/chat/index.ts`

当前配置：

```ts
skills: "all",
settingSources: ["project"],
```

保持即可。因为 skill 存放在 `.claude/skills/test-writer/SKILL.md`，`settingSources: ["project"]` 可以让项目级 skill 生效。

### 5.2 `agents/chat/_stream.ts`

建议新增一个静态 skill 元数据常量：

```ts
const PROJECT_SKILLS = [
  {
    name: 'test-writer',
    description: 'Write unit tests and integration tests for code.',
    presetKey: 'preset.skill.testWriter',
  },
];
```

stream 开始时发送：

```ts
enqueueSse(controller, encoder, 'skills_available', {
  skills: PROJECT_SKILLS,
});
```

保留或替换原来的 `skills_loaded` 均可。为了兼容现有 debug，可以保留原事件，并新增更语义化的 `skills_available`。

### 5.3 检测实际 `load_skill`

在遍历 Claude SDK stream message 时，增加检测函数：

```ts
function detectLoadedSkill(msg: any): string | null {
  const blocks = msg.message?.content ?? [];
  for (const block of blocks) {
    const name = block?.name || block?.tool_name || '';
    const input = block?.input ?? {};

    if (name === 'load_skill' || name.endsWith('__load_skill')) {
      const skillName = input.skill || input.name || input.skillName;
      if (skillName === 'test-writer') return 'test-writer';
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

如果 SDK 的实际字段不同，需要根据 debug 面板中的原始消息调整检测逻辑。

---

## 6. 前端 API 层改造

文件：`src/api.ts`

### 6.1 类型新增

```ts
export interface SkillInfo {
  name: string;
  description?: string;
  presetKey?: string;
}

export interface SkillLoadedPayload {
  name: string;
  status: 'available' | 'loaded';
}
```

### 6.2 回调新增

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

### 6.3 SSE switch 新增分支

```ts
case 'skills_available':
  cb.onSkillAvailable?.(parsed.skills || []);
  break;
case 'skill_loaded':
  cb.onSkillLoaded?.({ name: parsed.name, status: parsed.status || 'loaded' });
  break;
```

如果继续使用原 `skills_loaded`，也可以让它走 `onSkillAvailable`，但 payload 最好改成具体列表。

---

## 7. 前端 UI 展示方案

### 7.1 状态设计

在 `src/types.ts` 新增：

```ts
export interface SkillState {
  id: string;
  name: string;
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

### 7.2 展示位置

推荐放在 header 右侧当前工具灯旁边，和 `ToolIndicators` 并列：

```tsx
<ToolIndicators lamps={lamps} />
<SkillIndicators skills={skills} />
```

或者直接扩展现有 `ToolIndicators`，新增一个 skill lamp：

```ts
{
  id: 'skill:test-writer',
  label: 'test-writer',
  icon: '🧪',
  active: false,
  animKey: 0,
}
```

为了改动最小，推荐复用现有灯组件：

- 初始 label：`Skill: test-writer`
- `skills_available` 后展示灰色/普通状态；
- `skill_loaded` 后短暂高亮，表示模型加载了该 skill。

### 7.3 i18n 文案

`src/i18n/zh.ts`：

```ts
"skill.testWriter.label": "测试编写",
"skill.testWriter.available": "test-writer skill 已启用",
"skill.testWriter.loaded": "正在使用 test-writer",
```

`src/i18n/en.ts`：

```ts
"skill.testWriter.label": "Test Writer",
"skill.testWriter.available": "test-writer skill enabled",
"skill.testWriter.loaded": "Using test-writer",
```

---

## 8. 推荐最小落地步骤

按以下顺序实现：

1. 在 `src/i18n/zh.ts`、`src/i18n/en.ts` 新增 `preset.skill.testWriter`；
2. 修改 `src/components/ChatInput.tsx`，将 `PRESET_KEYS` 改成只包含 `preset.skill.testWriter`；
3. 在 `agents/chat/_stream.ts` 新增 `PROJECT_SKILLS`；
4. stream 开始时新增 SSE `skills_available`，payload 返回 `test-writer` 元数据；
5. 在 `src/api.ts` 增加 `onSkillAvailable` / `onSkillLoaded` 回调；
6. 在 `App.tsx` 保存 skill 状态；
7. 复用 `ToolLamp` 或新增 `SkillIndicators`，在 header 中显示 `test-writer`；
8. 在 `_stream.ts` 尝试检测 `load_skill` 并发送 `skill_loaded`；
9. 如果 SDK 不暴露 `load_skill`，前端至少展示 `skills_available`，标记为“已启用”，不要误称“已加载”；
10. 用预制问题触发一次请求，在 DebugPanel 中确认是否能看到实际 `load_skill` 相关 raw event，再按实际字段补强检测函数。

---

## 9. 验证清单

### 9.1 预制问题

- 页面只显示一个和 `test-writer` 相关的 preset chip；
- 点击 preset 后能发送完整问题；
- 问题内容能稳定触发写测试意图；
- 中英文切换后 preset 文案正确。

### 9.2 Skill 可用展示

- 发起 `/chat` 后，后端发送 `skills_available`；
- 前端能显示 `test-writer` skill；
- DebugPanel 能看到 `skills_available` 事件；
- 不出现 undefined/null 文案。

### 9.3 Skill 实际加载展示

- 如果 SDK stream 中有 `load_skill` 事件，后端能解析出 `test-writer`；
- 前端收到 `skill_loaded` 后，`test-writer` 指示器短暂高亮；
- 如果 SDK 没有明确 `load_skill` 事件，页面只显示“已启用”，不要显示“正在使用”。

### 9.4 回归验证

- 原有 `tool_called` 灯效不受影响；
- 原有 SSE 文本流不受影响；
- 停止生成、清空历史、调试面板仍正常；
- TypeScript 编译通过。

---

## 10. 注意事项

- 不建议前端直接读取 `.claude/skills/test-writer/SKILL.md`，因为浏览器打包后不一定能访问该文件；推荐用 i18n 或显式 skill catalog 配置。
- 不建议把“skills: all”直接展示给用户，它不是具体 skill 名。
- 如果要表达“实际 load_skill”，必须以后端 stream 中检测到的事件为准；否则只能表达“skill available/enabled”。
- 当前只有一个 skill，可以硬编码 `test-writer`，但最好把元数据集中到一个常量，方便后续扩展。
