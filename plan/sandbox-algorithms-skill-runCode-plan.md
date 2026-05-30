# `sandbox-algorithms` Skill + 沙箱 `runCode` 执行方案

目标：在 `claude-agent-starter` 项目中新增一个更有演示价值的 Skill：`sandbox-algorithms`。该 Skill 用于处理斐波那契、阶乘、质数、排序、组合数等简单算法类问题，并指导 Claude Agent 优先通过 EdgeOne Sandbox 的代码执行工具真实运行脚本，而不是只依赖模型心算。

典型预制问题：

```txt
计算斐波那契数列前 20 个，并给出执行结果。
```

期望体验：

1. 用户点击预制问题。
2. Claude SDK 识别并加载 `sandbox-algorithms` skill。
3. Skill 指导 Agent 读取或复用 `scripts/` 中的算法脚本。
4. Agent 调用 EdgeOne MCP 工具中的 `code_interpreter`。
5. `code_interpreter` 在沙箱中执行 Python/JS 代码。
6. 前端 Trace 面板展示 skill 加载、工具调用和执行结果。
7. 用户看到真实运行得到的答案。

---

## 1. 背景与设计判断

### 1.1 Skill 的定位

Skill 不等于一个直接可执行函数。它更像是一个可被 Agent 动态加载的能力包，通常包含：

```text
skill-name/
├── SKILL.md          # 触发条件、执行流程、输出格式、注意事项
├── scripts/          # 可复用、可执行或可复制的脚本
├── references/       # 大段参考文档、API 说明、业务规则
└── assets/           # 模板、图片、示例工程等输出资源
```

对于本方案：

- `SKILL.md` 负责告诉 Agent：什么时候使用该 skill、怎么选择算法、如何调用沙箱执行。
- `scripts/` 负责沉淀可复用算法实现，避免每次都重新写一遍。
- 真正的执行能力来自 EdgeOne Sandbox 工具，尤其是 `code_interpreter` / `runCode`。

### 1.2 与 `mcp-builder` skill 的关系

`mcp-builder` 的思路是：

```text
mcp-builder/
├── SKILL.md
├── reference/
└── scripts/
```

它把 MCP 开发流程、参考资料、辅助脚本封装成一个工程型 Skill。`sandbox-algorithms` 使用同一类模式，只是目标从“构建 MCP Server”变成“执行算法脚本”。

对比：

| 项目 | `mcp-builder` | `sandbox-algorithms` |
|---|---|---|
| 目标 | 构建 MCP Server | 执行简单算法 |
| 核心资源 | `reference/` + `scripts/` | `scripts/` + 少量 `references/` |
| 执行方式 | 读规范、生成代码、运行检查脚本 | 调用沙箱 `code_interpreter` 执行代码 |
| 典型输入 | “帮我写一个 MCP Server” | “计算斐波那契前 20 个” |
| 价值 | 工程流程复用 | 真实工具执行演示 |

### 1.3 当前项目已具备的基础

当前项目的 `agents/chat/index.ts` 已经接入 Claude Agent SDK 和 EdgeOne MCP 工具：

- 通过 `context.tools.toClaudeMcpServer()` 把 EdgeOne Sandbox 工具转换为 Claude SDK MCP Server。
- 通过 `createSdkMcpServer(...)` 注册 MCP Server。
- 将 `edgeoneMcp.allowedTools` 传入 Claude SDK。
- 设置 `skills: "all"`，允许 Claude SDK 使用项目 Skill。

因此，在该项目里新增 `sandbox-algorithms` skill 后，Agent 理论上可以同时使用：

- Claude SDK 的 skill 加载机制；
- EdgeOne MCP 工具中的 `code_interpreter`；
- 前端已有的 Trace/SSE 展示能力。

---

## 2. 沙箱工具执行能力参考

参考文档：

```text
/Users/wenyiqing/Downloads/agent-toolkit-master/agent-toolkit/README.md
```

### 2.1 Runtime 注入方式

Pages Agent Runtime 推荐直接使用运行时注入的能力：

```ts
context.sandbox
context.tools
```

模板业务代码通常不需要手动配置 sandbox token、ProjectId、API Base 等。文档建议：

```ts
export async function onRequest(context: any) {
  const result = await context.sandbox.commands.run('echo "hello"', {
    timeout: 10,
  })

  return Response.json(result)
}
```

本项目更适合使用 `context.tools`，因为 Claude Agent SDK 需要把工具注册成 MCP Server。

### 2.2 `code_interpreter.runCode`

文档中的 Sandbox API：

| 模块 | 方法 | 参数 | 返回值 | 说明 |
|---|---|---|---|---|
| `code_interpreter` | `runCode(code, opts?)` | `code: str`, `opts: { language?, timeout? }` | `Execution { results, logs, error }` | 在 Jupyter kernel 中执行代码，变量跨调用保留 |

注意点：

- `timeout` 单位是秒。
- 适合执行 Python、JavaScript、R、Bash 等代码。
- 返回值包含执行结果、日志和错误信息。
- 变量可能跨调用保留，因此算法脚本应尽量自包含，避免依赖前一次调用留下的状态。

### 2.3 Claude MCP helper

文档推荐使用：

```ts
const edgeoneMcp = context.tools.toClaudeMcpServer()

const mcpServers = [
  createSdkMcpServer({
    name: edgeoneMcp.name,
    tools: edgeoneMcp.tools,
  }),
]

const allowedTools = edgeoneMcp.allowedTools
```

默认 MCP server name 是 `edgeone`，因此工具名会展开为：

```text
mcp__edgeone__commands
mcp__edgeone__files_read
mcp__edgeone__browser_fetch
mcp__edgeone__code_interpreter
mcp__edgeone__web_search
```

本方案最关键的工具是：

```text
mcp__edgeone__code_interpreter
```

它对应 toolkit 中的：

```text
code_interpreter
```

参数：

```json
{
  "language": "python",
  "code": "print(1 + 1)",
  "timeout": 10
}
```

### 2.4 内置工具列表中与本方案相关的工具

| 工具名 | 用途 |
|---|---|
| `code_interpreter` | 执行算法代码，是本方案核心 |
| `files_read` | 读取 skill 中的脚本或临时文件 |
| `files_write` | 必要时把脚本写入沙箱文件系统 |
| `commands` | 可选，用于执行 shell 命令或调试环境 |

推荐优先使用 `code_interpreter`，只有在需要真实文件、依赖安装或命令级执行时才使用 `files_*` / `commands`。

---

## 3. 目标目录结构

建议新增：

```text
.agents/skills/sandbox-algorithms/
├── SKILL.md
├── scripts/
│   └── algorithms.py
└── references/
    └── sandbox-tooling.md
```

同时保持 Claude SDK 能识别的目录同步：

```text
.claude/skills/sandbox-algorithms/
├── SKILL.md
├── scripts/
│   └── algorithms.py
└── references/
    └── sandbox-tooling.md
```

如果构建产物或 EdgeOne 运行目录需要同步，也应同步到：

```text
.edgeone/agent-node/.claude/skills/sandbox-algorithms/
```

但 `.edgeone/agent-node` 更像运行时/构建派生目录，是否手动维护需要结合当前项目部署流程决定。优先维护源码目录：

```text
.agents/skills/
.claude/skills/
```

---

## 4. Skill 详细设计

### 4.1 Skill 名称

```text
sandbox-algorithms
```

### 4.2 中文展示名

```text
沙箱算法执行
```

### 4.3 描述原则

`description` 要写得足够明确，因为它会影响 Agent 是否触发该 skill。

推荐包含这些触发词：

- Fibonacci / 斐波那契
- factorial / 阶乘
- prime / 质数 / 素数
- sort / 排序
- combination / 组合数
- algorithm / 算法
- run code / 执行代码
- sandbox / 沙箱
- code_interpreter

### 4.4 `SKILL.md` 建议内容

文件：

```text
.agents/skills/sandbox-algorithms/SKILL.md
.claude/skills/sandbox-algorithms/SKILL.md
```

建议内容：

```md
---
name: sandbox-algorithms
description: This skill should be used when the user asks to compute or verify simple algorithmic results such as Fibonacci sequences, factorials, prime numbers, sorting, combinations, permutations, dynamic programming examples, or when the user explicitly asks to run algorithm scripts in the EdgeOne sandbox using code_interpreter or runCode.
---

# Sandbox Algorithms

## Purpose

Execute small deterministic algorithm tasks through the EdgeOne sandbox code interpreter instead of relying only on model reasoning.

## When to Use

Use this skill for requests involving:

- Fibonacci sequence calculation.
- Factorial calculation.
- Prime or composite number checks.
- Prime list generation.
- Sorting or searching examples.
- Combination, permutation, or binomial coefficient calculation.
- Small dynamic programming demonstrations.
- User requests that explicitly mention sandbox execution, runCode, code_interpreter, or algorithm scripts.

## Workflow

1. Identify the algorithm task and required inputs.
2. Prefer the reusable implementations in `scripts/algorithms.py`.
3. Build a small self-contained Python snippet that imports or includes the relevant implementation.
4. Execute the snippet with the EdgeOne sandbox `code_interpreter` tool.
5. Inspect `results`, `logs`, and `error`.
6. If execution fails, fix the code and run once more.
7. Return the final answer with a short explanation and the executed result.

## Tool Usage Rules

- Use `code_interpreter` for actual computation whenever available.
- Do not fake tool outputs.
- Do not rely only on mental arithmetic for requested algorithm execution.
- Keep code snippets deterministic and self-contained.
- Set a reasonable timeout, usually 5 to 15 seconds for small algorithms.
- Avoid network access unless the user explicitly asks for it.
- Avoid writing files unless a file is necessary for the task.

## Output Format

Return:

```md
## Result

...

## Method

- Algorithm: ...
- Executed with: EdgeOne sandbox `code_interpreter`

## Execution Output

```text
...
```
```

For very small answers, keep the response concise.
```

### 4.5 `references/sandbox-tooling.md` 建议内容

这个文件用于放更细的沙箱工具说明，避免 `SKILL.md` 过长。

建议内容要点：

```md
# Sandbox Tooling Reference

The EdgeOne Pages Agent Toolkit exposes sandbox execution through `context.sandbox` and `context.tools`.

For Claude Agent SDK, tools are usually registered through `context.tools.toClaudeMcpServer()`.

The relevant MCP tool is `code_interpreter`, usually exposed to Claude as `mcp__edgeone__code_interpreter`.

Arguments:

```json
{
  "language": "python",
  "code": "print(1 + 1)",
  "timeout": 10
}
```

Use Python for deterministic algorithm tasks unless the user asks for another language.
```

---

## 5. `scripts/algorithms.py` 设计

### 5.1 设计目标

`scripts/algorithms.py` 不需要做成复杂 CLI，先保持简单、可复制、可读、确定性强。

要求：

- 不依赖第三方包。
- 函数名清晰。
- 输入校验明确。
- 输出稳定。
- 适合被 Agent 读取后复制到 `code_interpreter` 中执行。

### 5.2 推荐函数列表

```python
def fibonacci(n: int) -> list[int]:
    """Return the first n Fibonacci numbers, starting from 0."""


def factorial(n: int) -> int:
    """Return n!."""


def is_prime(n: int) -> bool:
    """Return whether n is prime."""


def primes_up_to(limit: int) -> list[int]:
    """Return all primes <= limit."""


def quick_sort(values: list[int]) -> list[int]:
    """Return a sorted copy of values."""


def binary_search(values: list[int], target: int) -> int:
    """Return index of target in sorted values, or -1."""


def combination(n: int, k: int) -> int:
    """Return C(n, k)."""
```

### 5.3 推荐脚本内容

```python
from __future__ import annotations


def _require_non_negative_int(name: str, value: int) -> None:
    if not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    if value < 0:
        raise ValueError(f"{name} must be non-negative")


def fibonacci(n: int) -> list[int]:
    _require_non_negative_int("n", n)
    seq: list[int] = []
    a, b = 0, 1
    for _ in range(n):
        seq.append(a)
        a, b = b, a + b
    return seq


def factorial(n: int) -> int:
    _require_non_negative_int("n", n)
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result


def is_prime(n: int) -> bool:
    if not isinstance(n, int):
        raise TypeError("n must be an integer")
    if n < 2:
        return False
    if n == 2:
        return True
    if n % 2 == 0:
        return False
    factor = 3
    while factor * factor <= n:
        if n % factor == 0:
            return False
        factor += 2
    return True


def primes_up_to(limit: int) -> list[int]:
    _require_non_negative_int("limit", limit)
    return [n for n in range(2, limit + 1) if is_prime(n)]


def quick_sort(values: list[int]) -> list[int]:
    if len(values) <= 1:
        return values[:]
    pivot = values[len(values) // 2]
    left = [x for x in values if x < pivot]
    middle = [x for x in values if x == pivot]
    right = [x for x in values if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)


def binary_search(values: list[int], target: int) -> int:
    low, high = 0, len(values) - 1
    while low <= high:
        mid = (low + high) // 2
        if values[mid] == target:
            return mid
        if values[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1


def combination(n: int, k: int) -> int:
    _require_non_negative_int("n", n)
    _require_non_negative_int("k", k)
    if k > n:
        return 0
    k = min(k, n - k)
    result = 1
    for i in range(1, k + 1):
        result = result * (n - k + i) // i
    return result


if __name__ == "__main__":
    print("fibonacci(20)=", fibonacci(20))
```

### 5.4 为什么不一开始做复杂 CLI

可以先不做：

```bash
python algorithms.py fibonacci 20
```

原因：

1. Agent 通过 `code_interpreter` 执行时，直接传 Python 代码更简单。
2. CLI 需要参数解析、错误码、stdout 约定，早期会增加复杂度。
3. 当前目标是演示 Skill + 沙箱执行，不是做完整算法命令行工具。

后续如果预制问题变多，再升级为 CLI。

---

## 6. 执行链路设计

### 6.1 推荐链路：Skill 指导 Agent 调用 `code_interpreter`

用户输入：

```txt
计算斐波那契数列前 20 个，并给出执行结果。
```

Agent 行为：

1. Claude SDK 触发 `load_skill`。
2. 加载 `.claude/skills/sandbox-algorithms/SKILL.md`。
3. Skill 要求使用 `scripts/algorithms.py` 的算法实现。
4. Agent 读取脚本或直接内联相关函数。
5. Agent 调用：

```json
{
  "tool": "mcp__edgeone__code_interpreter",
  "input": {
    "language": "python",
    "timeout": 10,
    "code": "def fibonacci(n):\n    seq=[]\n    a,b=0,1\n    for _ in range(n):\n        seq.append(a)\n        a,b=b,a+b\n    return seq\nprint(fibonacci(20))"
  }
}
```

6. 工具返回日志或结果。
7. Agent 总结：

```txt
斐波那契数列前 20 个为：
0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181
```

### 6.2 是否需要 `context.sandbox.runCode`

`context.sandbox.code_interpreter.runCode(...)` 是模板代码可以直接调用的底层 API；而 Agent 对话中更自然的方式是通过 MCP 工具调用：

```text
mcp__edgeone__code_interpreter
```

两者关系：

```text
Agent tool call
  ↓
mcp__edgeone__code_interpreter
  ↓
context.tools.toClaudeMcpServer()
  ↓
context.sandbox.code_interpreter.runCode(...)
  ↓
EdgeOne Sandbox 执行环境
```

所以 `SKILL.md` 中建议写“使用 `code_interpreter` / `runCode`”，但实际运行时通常是 Claude 调用 MCP 工具，而不是在 `SKILL.md` 里直接调用 TypeScript API。

---

## 7. 两种落地方案

### 7.1 方案 A：纯 Skill 方案，改动最小

新增：

```text
.agents/skills/sandbox-algorithms/SKILL.md
.agents/skills/sandbox-algorithms/scripts/algorithms.py
.agents/skills/sandbox-algorithms/references/sandbox-tooling.md
.claude/skills/sandbox-algorithms/SKILL.md
.claude/skills/sandbox-algorithms/scripts/algorithms.py
.claude/skills/sandbox-algorithms/references/sandbox-tooling.md
```

更新：

```text
agents/chat/_stream.ts
src/i18n/zh.ts
src/i18n/en.ts
src/components/ChatInput.tsx
```

优点：

- 改动小。
- 符合 Skill 的原生使用方式。
- 可以展示 skill 加载、tool 调用、真实执行结果。
- 不需要额外封装后端工具。

缺点：

- Agent 是否读取 `scripts/algorithms.py`、是否内联正确代码，仍由模型决策。
- 对复杂算法或更严格输入输出不够稳定。

适合当前 demo 阶段。

### 7.2 方案 B：封装 `run_algorithm_script` 工具，稳定性更高

后续可以新增一个更明确的工具：

```text
run_algorithm_script
```

输入：

```json
{
  "algorithm": "fibonacci",
  "args": { "n": 20 },
  "language": "python"
}
```

后端逻辑：

1. 校验 `algorithm` 是否在白名单中。
2. 根据 `algorithm` 选择固定脚本模板。
3. 调用 `context.sandbox.code_interpreter.runCode(...)`。
4. 返回结构化结果。

优点：

- Agent 不需要自己拼脚本。
- 算法名称和参数可控。
- 输入输出稳定，适合产品化。
- 可以做超时、白名单、错误处理和日志埋点。

缺点：

- 需要扩展后端工具注册逻辑。
- 初期工程量更大。
- 需要决定如何把自定义工具并入 Claude MCP server。

建议：

- 第一阶段先做方案 A。
- 如果 demo 效果好，再进入方案 B。

---

## 8. 具体文件改造计划

### 8.1 新增 Skill 目录

新增：

```text
.agents/skills/sandbox-algorithms/
.claude/skills/sandbox-algorithms/
```

每个目录包含：

```text
SKILL.md
scripts/algorithms.py
references/sandbox-tooling.md
```

注意：

- `.agents/skills` 可作为项目自定义 skill 目录。
- `.claude/skills` 是 Claude SDK 常见识别目录。
- 当前项目已经同时存在 `.agents/skills/web-search` 和 `.claude/skills/web-search`，因此新增 skill 时建议两个目录保持同步。

### 8.2 更新 skill catalog

文件：

```text
agents/chat/_stream.ts
```

当前 `PROJECT_SKILLS` 只有：

```ts
const PROJECT_SKILLS = [
  {
    name: 'web-search',
    label: '网络搜索',
    description: 'Use web/search or browser tools to gather current external information and summarize findings with sources.',
  },
];
```

改为：

```ts
const PROJECT_SKILLS = [
  {
    name: 'web-search',
    label: '网络搜索',
    description: 'Use web/search or browser tools to gather current external information and summarize findings with sources.',
  },
  {
    name: 'sandbox-algorithms',
    label: '沙箱算法执行',
    description: 'Run deterministic algorithm scripts through the EdgeOne sandbox code_interpreter and return verified execution results.',
  },
];
```

作用：

- 前端能收到 `skills_available` 事件。
- Trace 面板或 skill 状态 UI 能展示新 skill。

### 8.3 更新中文预制问题

文件：

```text
src/i18n/zh.ts
```

新增：

```ts
"preset.skill.sandboxAlgorithms": "计算斐波那契数列前 20 个，并给出执行结果。",
"skill.sandboxAlgorithms": "沙箱算法执行",
```

可选：保留已有 `web-search` 预制问题，也可以替换其中一个普通 preset。

### 8.4 更新英文预制问题

文件：

```text
src/i18n/en.ts
```

新增：

```ts
"preset.skill.sandboxAlgorithms": "Use the sandbox-algorithms skill to calculate the first 20 Fibonacci numbers and return the executed result.",
"skill.sandboxAlgorithms": "Sandbox Algorithms",
```

### 8.5 更新预制问题列表

文件：

```text
src/components/ChatInput.tsx
```

当前：

```ts
const PRESET_KEYS = ['preset.1', 'preset.2', 'preset.4', 'preset.skill.webSearch'] as const;
```

推荐改为：

```ts
const PRESET_KEYS = [
  'preset.1',
  'preset.2',
  'preset.skill.webSearch',
  'preset.skill.sandboxAlgorithms',
] as const;
```

如果想突出新能力，也可以只保留两个 skill preset：

```ts
const PRESET_KEYS = [
  'preset.skill.webSearch',
  'preset.skill.sandboxAlgorithms',
] as const;
```

建议当前 demo 保留 4 个：命令、代码执行、网络搜索、沙箱算法执行。

---

## 9. System Prompt 是否需要调整

文件：

```text
agents/chat/index.ts
```

当前系统提示已经包含：

```text
- code_interpreter: run code in an isolated interpreter.
  Parameters: language (e.g. "python"), code (the source code to execute).
```

还包含：

```text
Use tools whenever they help answer the user's question concretely.
Call tools ONE AT A TIME. Do NOT simulate or fake tool outputs — actually call the tool.
```

这对本方案是有利的。

可选增强：

```ts
'For algorithm skills such as sandbox-algorithms, prefer calling code_interpreter to verify results instead of relying only on mental calculation.\n' +
```

但不建议一开始大改系统提示。优先通过 `SKILL.md` 的描述和预制问题显式触发。

---

## 10. 推荐实施顺序

### 阶段 1：纯 Skill MVP

1. 新建 `.agents/skills/sandbox-algorithms`。
2. 新建 `.claude/skills/sandbox-algorithms`。
3. 编写 `SKILL.md`。
4. 编写 `scripts/algorithms.py`。
5. 编写 `references/sandbox-tooling.md`。
6. 更新 `agents/chat/_stream.ts` 的 `PROJECT_SKILLS`。
7. 更新 `src/i18n/zh.ts` 和 `src/i18n/en.ts`。
8. 更新 `src/components/ChatInput.tsx` 的 `PRESET_KEYS`。
9. 本地运行并点击预制问题验证。

### 阶段 2：增强稳定性

1. 观察 Agent 是否稳定调用 `code_interpreter`。
2. 如果经常只心算、不调用工具，则强化 `SKILL.md` 和系统提示。
3. 如果经常生成不同脚本，则把 `scripts/algorithms.py` 写得更容易复制。
4. 如果需要强约束执行，进入方案 B：封装 `run_algorithm_script`。

### 阶段 3：产品化工具封装

1. 设计自定义工具 schema。
2. 对 `algorithm` 做白名单。
3. 对参数做校验。
4. 内部调用 `context.sandbox.code_interpreter.runCode(...)`。
5. 把工具加入 Claude MCP Server 或其他工具注册链路。
6. 更新 Skill，让它优先调用 `run_algorithm_script`，失败时再降级到 `code_interpreter`。

---

## 11. 验收标准

### 11.1 文件验收

项目中存在：

```text
.agents/skills/sandbox-algorithms/SKILL.md
.agents/skills/sandbox-algorithms/scripts/algorithms.py
.agents/skills/sandbox-algorithms/references/sandbox-tooling.md
.claude/skills/sandbox-algorithms/SKILL.md
.claude/skills/sandbox-algorithms/scripts/algorithms.py
.claude/skills/sandbox-algorithms/references/sandbox-tooling.md
```

### 11.2 UI 验收

页面预制问题中出现：

```txt
计算斐波那契数列前 20 个，并给出执行结果。
```

英文环境中出现：

```txt
Use the sandbox-algorithms skill to calculate the first 20 Fibonacci numbers and return the executed result.
```

### 11.3 Agent 行为验收

点击预制问题后，Trace 中应能观察到：

1. `skills_available` 事件包含 `sandbox-algorithms`。
2. Claude SDK 尝试加载 skill，理想情况下出现 `skill_loaded`。
3. 出现 `tool_called`，工具名为 `code_interpreter`。
4. 工具返回执行日志或结果。
5. 最终答案包含斐波那契前 20 项。

预期结果：

```text
0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181
```

### 11.4 稳定性验收

至少测试这些问题：

```txt
计算斐波那契数列前 20 个。
```

```txt
判断 104729 是不是质数。
```

```txt
计算 30!。
```

```txt
计算 C(52, 5)。
```

```txt
把 [5, 3, 8, 1, 2] 排序。
```

每个问题都应调用沙箱代码执行工具，而不是只直接回答。

---

## 12. 风险与注意事项

### 12.1 Skill 不能凭空创造工具

`SKILL.md` 只能指导 Agent 行为，不能自己提供新的 runtime API。必须确保后端已经把 `code_interpreter` 暴露给 Claude SDK。

当前项目已经通过 `context.tools.toClaudeMcpServer()` 注册 EdgeOne 工具，因此具备基础条件。

### 12.2 `scripts/` 不一定会被自动执行

Skill 中的 `scripts/algorithms.py` 是资源文件，不代表 Claude SDK 会自动运行它。Agent 需要：

1. 加载 skill；
2. 根据说明读取或复用脚本；
3. 调用 `code_interpreter`；
4. 把脚本内容作为 code 参数执行。

因此，`SKILL.md` 必须明确写出执行流程。

### 12.3 避免过度依赖 shell

对于简单算法，优先使用 `code_interpreter`，不要动用 `commands` 执行复杂 shell。原因：

- `code_interpreter` 更贴近代码执行场景；
- 返回结果更结构化；
- 更适合在 Trace 中展示；
- 安全边界更清晰。

### 12.4 控制执行范围

算法脚本应避免：

- 无限循环；
- 大规模内存占用；
- 网络请求；
- 文件系统破坏性操作；
- 任意用户代码直通执行。

对于用户提供的算法参数，应限制规模。例如：

- Fibonacci `n <= 10000`；
- 排序数组长度不超过合理范围；
- 组合数参数避免极端大数；
- `timeout` 通常设置为 5 到 15 秒。

### 12.5 后续封装工具时必须做白名单

如果实现 `run_algorithm_script`，不要允许用户传任意 Python 代码给后端直接执行。应使用：

```ts
const ALLOWED_ALGORITHMS = new Set([
  'fibonacci',
  'factorial',
  'is_prime',
  'primes_up_to',
  'quick_sort',
  'binary_search',
  'combination',
]);
```

然后根据算法名称生成固定代码模板。不要拼接未校验的代码片段。

---

## 13. 推荐最终效果

在 starter demo 中保留以下能力组合：

| 预制问题 | 展示能力 |
|---|---|
| 检查系统时间和 OS | `commands` |
| 创建并执行 `/tmp/fib.py` | `files_write` + `commands` 或代码运行 |
| 网络搜索当前信息 | `web_search` / `browser` |
| 计算斐波那契前 20 个 | `sandbox-algorithms` + `code_interpreter` |

这样用户能直观看到：

1. Agent 能使用命令行；
2. Agent 能操作文件；
3. Agent 能访问外部信息；
4. Agent 能加载 Skill；
5. Agent 能通过 Skill 调用沙箱代码执行。

这比单纯翻译类 Skill 更能体现 EdgeOne Sandbox + Claude Agent SDK 的组合价值。
