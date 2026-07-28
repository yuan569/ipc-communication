# IPC Communication — Electron 多窗体 IPC 基础骨架

基于 Electron 的**类型安全 IPC 事件总线**，支持 fire-and-forget、ACK、request/response 三种通信模式，可作为多业务窗体桌面应用的可扩展基础骨架。

---

## 架构总览

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Renderer 层（多窗体）                              │
│                                                                            │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  workbench   │  │  dialer  │  │ partner:auto │  │ partner:credit /  │  │
│  │（主控台）     │  │（外呼窗）  │  │（工单窗）     │  │ consumer / risk   │  │
│  │             │  │          │  │              │  │（占位，待接入）     │  │
│  └──────┬───────┘  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │               │               │                    │             │
│         └───────────────┴───────────────┴────────────────────┘             │
│                         window.__bus（由 preload 注入）                      │
│                    emit() / ack() / request() / respond() / on()           │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │  IPC 通道（contextBridge / contextIsolation）
                    bus:emit / bus:ack / bus:request / bus:event
                                 │
┌────────────────────────────────▼───────────────────────────────────────────┐
│                        event-bus-client / preload                           │
│   preload.js  ──  contextBridge.exposeInMainWorld('__bus', {...})           │
│   client.ts   ──  createBusClient(identity)  本地 registry 二次分发          │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────────┐
│                         event-bus-core（主进程总线）                          │
│                                                                            │
│  bus.ts                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  IPC 桥接入口                                                         │   │
│  │   ipcMain.on('bus:emit')  →  assertSenderIdentity → emit()          │   │
│  │   ipcMain.handle('bus:ack')                                         │   │
│  │   ipcMain.handle('bus:request')                                     │   │
│  │                                                                     │   │
│  │  emit() 流程                                                          │   │
│  │   1. requestTracker.resolveReply()  ← 若带 replyTo，直接完成请求       │   │
│  │   2. validateEvent()                ← 协议 + 来源/目标校验             │   │
│  │   3. auditLog()                     ← 异步队列写日志                   │   │
│  │   4. handlers.forEach()             ← 主进程业务 handler               │   │
│  │   5. dispatch()                     ← 定向 / 广播到 Renderer 窗口      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                            │
│  router.ts          validateEvent()  domain / type / source / target 校验   │
│  sender-auth.ts     assertSenderIdentity()  webContents.id → identity 绑定  │
│  request-tracker.ts register / resolveReply / sweepExpired                 │
│  audit.ts           异步队列 → logs/ipc-audit-YYYY-MM-DD.log                │
│  errors.ts          normalizeBusError()  → 稳定 BusErrorCode               │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────────┐
│                           main-app（主进程编排层）                            │
│                                                                            │
│  main.ts             初始化 bus、state，调用 register / createMainWindows    │
│  handlers.ts         registerMainHandlers()  LOCK_CUSTOMER / RISK_CHECK    │
│  windows.ts          createMainWindows()  按 registry 顺序创建并注册窗体      │
│  window-registry.ts  MAIN_WINDOW_REGISTRY  窗体配置声明（新增窗体改这里）      │
└────────────────────────────────────────────────────────────────────────────┘
                                 ▲
┌────────────────────────────────┴───────────────────────────────────────────┐
│                            shared（协议中心）                                 │
│                                                                            │
│  protocol.ts   WINDOW_IDENTITIES / DOMAIN_TYPES / EVENT_POLICY / BUS_POLICY│
│  types.ts      BusEvent / EventMap / RequestMap / ResponseMap / BusErrorCode│
└────────────────────────────────────────────────────────────────────────────┘
```

---

## IPC 通信模式

项目支持三种模式，均通过同一条总线路径处理：

### 1. Fire-and-forget（单向发送）

```
Renderer ──bus:emit──▶ 主进程 ──dispatch──▶ 目标 Renderer
```

适用于不需要响应的通知，如 `TICKET_DONE`。

### 2. ACK（发送确认）

```
Renderer ──bus:ack──▶ 主进程（校验+分发）──▶ 返回 { id }
```

适用于只需知道消息已成功进入总线的场景。

### 3. Request / Response（请求响应）

```
Renderer ──bus:request──▶ 主进程 requestTracker.register()
                              └──▶ emit() ──▶ 目标（Renderer 或 main handler）
                                       响应方 respond(event, payload)
                              ──bus:emit──▶ 主进程 requestTracker.resolveReply()
                         ◀──────────────── BusResponse<T>
```

响应事件与请求**同 type + replyTo 关联**，不使用独立 `*_RESULT` 事件类型。

---

## 事件协议

所有事件的 domain、type、source/target 白名单统一在 `shared/protocol.ts` 定义：

| 事件类型 | Domain | 发起方 | 目标 | 模式 |
|---|---|---|---|---|
| `OUTBOUND_DISPATCH` | cti | workbench | dialer | Request/Response |
| `CALL_START` | cti | workbench | `*` / dialer | Fire-and-forget |
| `LOCK_CUSTOMER` | crm | workbench | main | Request/Response |
| `TICKET_ACCEPT` | ticket | workbench | partner:auto | Request/Response |
| `TICKET_DONE` | ticket | partner:auto | workbench | Fire-and-forget |
| `RISK_CHECK` | risk | workbench | main | Request/Response |
| `CONTEXT_UPDATED` | context | main | `*` | 广播 |
| `LOG` | demo | any | `*` | 广播 |

> `RISK_CHECK` 响应通过 `replyTo` 关联，payload 形状见 `ResponseMap.RISK_CHECK`。

---

## 目录结构

```
.
├── main.ts                          # 主进程入口（编排层）
├── main-app/
│   ├── handlers.ts                  # 主进程业务 handler（LOCK_CUSTOMER / RISK_CHECK）
│   ├── window-registry.ts           # 窗体配置注册中心
│   └── windows.ts                   # 窗体创建与注册逻辑
│
├── event-bus-core/
│   ├── bus.ts                       # 主进程总线（IPC 桥接 + emit + dispatch）
│   ├── router.ts                    # 事件协议校验
│   ├── sender-auth.ts               # 发送者身份校验
│   ├── request-tracker.ts           # 请求响应生命周期管理
│   ├── audit.ts                     # 异步审计日志
│   └── errors.ts                    # 错误码归一化
│
├── event-bus-client/
│   ├── client.ts                    # 渲染端 SDK（emit / ack / request / respond / on）
│   ├── preload.js                   # contextBridge 桥接
│   └── index.ts                     # UMD 入口
│
├── shared/
│   ├── protocol.ts                  # 协议中心（唯一事实来源）
│   └── types.ts                     # 共享类型（BusEvent / EventMap / ResponseMap 等）
│
├── renderer/
│   ├── workbench/                   # 主控台（五类通信模式发起方）
│   ├── dialer/                      # 外呼窗（OUTBOUND_DISPATCH 响应方）
│   ├── partner/auto/                # 工单窗（TICKET_ACCEPT 响应方 + TICKET_DONE 发起方）
│   ├── partner/credit/              # 信贷窗（占位）
│   ├── partner/consumer/            # 消金窗（占位）
│   └── partner/risk/                # 风控窗（占位）
│
├── tests/
│   └── event-bus-core/
│       ├── errors.test.ts           # 错误码归一化测试
│       ├── router.test.ts           # 协议路由校验测试
│       ├── sender-auth.test.ts      # 发送者身份校验测试
│       └── request-tracker.test.ts  # 请求响应生命周期测试
│
├── scripts/
│   └── build-runtime-assets.js      # 构建时拷贝运行时资源到 dist-runtime/
│
├── dist/                            # tsc 编译产物
├── dist-umd/                        # rollup UMD 包（渲染端 SDK）
├── dist-runtime/                    # 运行时资源（renderer + preload + dist-umd 副本）
├── rollup.config.js
└── tsconfig.json
```

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发启动

```bash
npm start
```

完整构建（`tsc` → `rollup` → 拷贝运行时资源）后启动 Electron。

### 仅构建

```bash
npm run build:all
```

### 运行测试

```bash
npm test
```

基于 Node 原生测试框架，无需额外安装依赖，覆盖总线核心链路：
- 错误码归一化
- 协议路由校验
- 发送者身份校验
- 请求响应生命周期（replyTo / timeout / over_capacity / sweep）

---

## 安全模型

| 防护点 | 实现位置 | 说明 |
|---|---|---|
| 最小暴露面 | `preload.js` | 只暴露 `window.__bus`，不暴露完整 `ipcRenderer` |
| 上下文隔离 | `BrowserWindow.webPreferences` | `contextIsolation: true`，`nodeIntegration: false` |
| sender 身份校验 | `sender-auth.ts` | 主进程以 `webContents.id` 绑定真实 identity，拒绝伪造 `source` |
| 协议白名单 | `router.ts` | 事件须通过 domain / type / source / target 四维校验 |
| 回包授权 | `request-tracker.ts` | 仅 `expectedResponder`（原请求 target）且 type 匹配时可完成 pending |
| 响应容量守卫 | `request-tracker.ts` | pending 超出 1000 或重复 id 时立即返回错误 |

---

## 新增业务窗体

只需改动以下 4 处，不改总线核心：

1. **`shared/protocol.ts`** — 在 `WINDOW_IDENTITIES` 增加新窗体 id，视需要在 `DOMAIN_TYPES` 和 `EVENT_POLICY` 补充事件策略（二者须同步）
2. **`main-app/window-registry.ts`** — 在 `MAIN_WINDOW_REGISTRY` 增加一条窗体配置；未就绪的窗体可设 `placeholder: true`（默认启动时跳过）
3. **`main-app/handlers.ts`** — 视需要注册主进程 handler（仅 `target` 为 `main` / `*` 时会触发）
4. **`renderer/<name>/`** — 新增 `index.html` 和 `app.js`

---

## 构建产物说明

| 目录 | 内容 | 用途 |
|---|---|---|
| `dist/` | tsc 编译产物 | 主进程运行时 |
| `dist-umd/` | rollup UMD 包 | 渲染端 `<script>` 加载 |
| `dist-runtime/` | renderer + preload + UMD 副本 | 运行时统一资源目录，主进程优先从此加载 |
| `logs/` | `ipc-audit-*.log` | 审计日志（按天滚动，JSONL 格式） |

---

## 技术栈

| 依赖 | 版本 | 用途 |
|---|---|---|
| electron | ^39 | 主框架 |
| uuid | ^13 | 事件 id 生成 |
| typescript | ^5.6 | 类型系统 |
| rollup | ^4 | 渲染端 SDK 打包 |
