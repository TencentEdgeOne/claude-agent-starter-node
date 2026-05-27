# 首页右侧代码信息与执行后 SSE 调试面板切换方案

目标：用户首次进入页面时，右侧面板默认展示代码信息 `CodeViewer`；当用户开始执行一次对话后，右侧自动切换为 `SSE DebugPanel`，展示实时 SSE 调试日志。

---

## 1. 当前项目现状

### 1.1 当前右侧面板始终显示 DebugPanel

文件：`src/App.tsx`

当前右侧区域：

```tsx
<div className={styles.codePanel}>
  <DebugPanel events={debugEvents} onClear={() => setDebugEvents([])} />
</div>
```

也就是说：

- 用户刚进首页时，右侧就是空的 SSE 调试面板；
- `CodeViewer` 组件虽然存在，但没有被挂载使用；
- 首页右侧缺少“项目能力 / 代码结构”的展示效果。

### 1.2 代码信息组件已存在

文件：`src/components/CodeViewer.tsx`

该组件已经实现：

- 类代码编辑器 UI；
- 静态代码片段展示；
- `READ ONLY` 标签；
- 底部能力说明：`EdgeOne Store · MCP Tools · Claude Agent SDK`。

对应样式：

```txt
src/components/CodeViewer.module.css
```

因此不需要新增代码展示组件，直接复用即可。

### 1.3 DebugPanel 已存在

文件：`src/components/DebugPanel.tsx`

该组件已经实现：

- SSE 事件计数；
- 清空按钮；
- 空状态；
- 自动滚动到底部；
- 按事件类型展示事件数据。

对应样式：

```txt
src/components/DebugPanel.module.css
```

---

## 2. 期望交互

### 2.1 首次进入页面

右侧展示 `CodeViewer`。

用户看到的是项目代码/能力介绍，而不是一个空的调试面板。

```txt
左侧：聊天窗口 + 预制问题
右侧：代码信息展示 CodeViewer
```

### 2.2 用户点击发送 / 预制问题

一旦开始执行：

1. 左侧追加用户消息和 assistant 占位消息；
2. `loading` 变为 `true`；
3. 右侧立即切换到 `DebugPanel`；
4. 后续 SSE 事件实时进入 `DebugPanel`。

```txt
用户发送消息
→ rightPanelMode = 'debug'
→ DebugPanel 显示
→ SSE events 持续追加
```

### 2.3 执行结束后

建议右侧继续保持 `DebugPanel`，不要自动切回 `CodeViewer`。

原因：

- 用户执行完后通常想查看 SSE 日志；
- 自动切回会让调试信息消失，体验不好；
- 如果用户想回到代码展示，可以通过手动按钮切回。

### 2.4 清空历史后

建议同时切回 `CodeViewer`。

原因：

- 清空历史意味着回到初始状态；
- `debugEvents` 可以同步清空；
- 首页展示恢复为代码信息，更符合“重新开始”的状态。

---

## 3. 状态设计

在 `App.tsx` 中新增右侧面板状态：

```ts
type RightPanelMode = 'code' | 'debug';

const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('code');
```

含义：

- `'code'`：展示 `CodeViewer`；
- `'debug'`：展示 `DebugPanel`。

---

## 4. 切换时机

### 4.1 初始状态

默认：

```ts
const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('code');
```

### 4.2 用户发送消息时切到 DebugPanel

文件：`src/App.tsx`

在 `handleSend` 开始处切换：

```ts
const handleSend = useCallback(async (text: string) => {
  setRightPanelMode('debug');

  // existing logic...
}, [...]);
```

建议放在 `handleSend` 的最前面，保证用户点击后右侧立即切换，不需要等第一个 SSE 事件回来。

### 4.3 收到 SSE 事件时兜底切到 DebugPanel

在 `onRawEvent` 中也可以兜底：

```ts
onRawEvent(event) {
  setRightPanelMode('debug');
  setDebugEvents(prev => [...prev, event]);
}
```

这样即使某些路径没有经过 `handleSend`，只要有 SSE 日志，右侧也会切换到调试面板。

### 4.4 清空历史时切回 CodeViewer

在 `handleClearHistory` 中新增：

```ts
setDebugEvents([]);
setRightPanelMode('code');
```

建议逻辑：

```ts
const handleClearHistory = useCallback(() => {
  // existing cleanup...
  setMessages([]);
  setDebugEvents([]);
  setRightPanelMode('code');
}, []);
```

---

## 5. 渲染改造

### 5.1 引入 CodeViewer

文件：`src/App.tsx`

新增 import：

```ts
import CodeViewer from './components/CodeViewer';
```

### 5.2 条件渲染右侧面板

替换当前固定 DebugPanel：

```tsx
<div className={styles.codePanel}>
  {rightPanelMode === 'code' ? (
    <CodeViewer />
  ) : (
    <DebugPanel events={debugEvents} onClear={() => setDebugEvents([])} />
  )}
</div>
```

这样最小改动即可满足：

- 首页右侧展示代码信息；
- 执行后展示 SSE 调试日志。

---

## 6. 可选增强：右侧面板顶部手动切换

如果希望用户执行后还能回看代码信息，可以增加一个轻量 tab：

```txt
[Code] [SSE]
```

状态仍然复用：

```ts
rightPanelMode: 'code' | 'debug'
```

按钮示例：

```tsx
<div className={styles.rightPanelTabs}>
  <button onClick={() => setRightPanelMode('code')}>Code</button>
  <button onClick={() => setRightPanelMode('debug')}>SSE</button>
</div>
```

但最小方案不建议先加 tab，原因：

- 当前需求只要求首页 code、开始执行后 debug；
- 增加 tab 会涉及额外 UI 样式；
- 初版保持自动切换更清晰。

如果后续要加 tab，建议将 tab 放在 `App.tsx` 的 `codePanel` 容器内，或者封装成 `RightPanel` 组件。

---

## 7. 可选增强：过渡动画

为了让切换不突兀，可以在 `App.module.css` 中新增：

```css
.rightPanelContent {
  flex: 1;
  min-height: 0;
  display: flex;
  animation: rightPanelFadeIn 180ms ease-out both;
}

@keyframes rightPanelFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```

渲染时：

```tsx
<div className={styles.codePanel}>
  <div key={rightPanelMode} className={styles.rightPanelContent}>
    {rightPanelMode === 'code' ? (
      <CodeViewer />
    ) : (
      <DebugPanel events={debugEvents} onClear={() => setDebugEvents([])} />
    )}
  </div>
</div>
```

`key={rightPanelMode}` 可以让切换时重新触发动画。

---

## 8. 推荐最小落地步骤

1. 在 `src/App.tsx` 引入 `CodeViewer`；
2. 新增类型 `RightPanelMode = 'code' | 'debug'`；
3. 新增状态：`rightPanelMode`，默认 `'code'`；
4. 在 `handleSend` 开始时执行 `setRightPanelMode('debug')`；
5. 在 `onRawEvent` 中兜底执行 `setRightPanelMode('debug')`；
6. 在 `handleClearHistory` 中执行：
   - `setDebugEvents([])`；
   - `setRightPanelMode('code')`；
7. 将右侧固定 `DebugPanel` 改成 `CodeViewer / DebugPanel` 条件渲染；
8. 可选：给右侧切换增加淡入动画。

---

## 9. 验证清单

### 9.1 首页初始状态

- 首次打开页面，右侧显示 `CodeViewer`；
- 不显示空的 SSE 调试面板；
- 左侧聊天功能不受影响。

### 9.2 开始执行后

- 点击任意预制问题或手动发送消息；
- 右侧立即切换为 `DebugPanel`；
- 第一个 SSE 事件回来后能正常展示；
- 后续 `text_delta`、`tool_called`、`debug_msg`、`done` 等事件持续追加。

### 9.3 执行结束后

- 右侧保持 `DebugPanel`；
- 日志不会因为 `loading=false` 自动消失；
- 清除 DebugPanel 按钮仍可用。

### 9.4 清空历史后

- 左侧消息清空；
- `debugEvents` 清空；
- 右侧恢复 `CodeViewer`；
- 新一轮发送后仍能再次切换到 `DebugPanel`。

### 9.5 回归验证

- `CodeViewer` 样式正常；
- `DebugPanel` 自动滚动仍正常；
- 停止生成逻辑不受影响；
- 图片 SSE / IndexedDB 存储逻辑不受影响；
- TypeScript 编译通过。

---

## 10. 注意事项

- 不建议以 `debugEvents.length > 0` 作为唯一判断条件，因为用户清空 DebugPanel 后可能仍希望留在调试面板；显式 `rightPanelMode` 更清晰。
- 不建议执行结束自动切回 `CodeViewer`，否则用户看不到完整 SSE 日志。
- 如果恢复历史时 `messages.length > 0`，仍建议默认展示 `CodeViewer`，只有新一轮执行开始后再切换到 `DebugPanel`。
- 如果后续增加手动 tab，自动切换逻辑仍然保留：发送消息时自动切到 `debug`。
