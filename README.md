# IPC Communication — Electron 多窗体 IPC 基础骨架

基于 Electron 的**类型安全 IPC 事件总线**，支持单向发送（emit）与请求/响应（request / respond），可作为多业务窗体桌面应用的可扩展基础骨架。

---

## 架构总览

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Renderer 层（多窗体）                              │
│                                                                            │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────┐                         │
│  │  workbench   │  │  dialer  │  │ partner:auto │                         │
│  │（主控台）     │  │（外呼窗）  │  │（工单窗）     │                         │
│  └──────┬───────┘  └────┬─────┘  └──────┬───────┘                         │
│         │               │               │                                  │
│         └───────────────┴───────────────┘                                  │
│              createBusClient(identity)  ← 业务只调用这一层                   │
│                    emit / request / respond / on                           │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────────┐
│                     event-bus-client（渲染端 SDK + 桥）                       │
│                                                                            │
│  client.ts   业务 API：enrich(source/ts) + 本地按 type 二次分发              │
│  preload.js  运输层：contextBridge → window.__bus                           │
│              emit / ack(内部) / request / on                               │
│              （ack 仅供 respond 回传错误码，不对业务暴露）                     │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │  IPC：bus:emit / bus:ack / bus:request / bus:event
                                 │  contextIsolation + nodeIntegration:false
┌────────────────────────────────▼───────────────────────────────────────────┐
│                         event-bus-core（主进程总线）                          │
│                                                                            │
│  bus.ts  emit 管线：                                                        │
│    1. tryCompletePendingReply  ← replyTo：授权回包 / 审计后结束              │
│       · 合法回包：完成 pending + auditLog，不再二次分发                       │
│       · 越权 / type 不匹配 / 无 pending(orphan) → 抛错，不落入普通投递        │
│    2. deliver：validateEvent → auditLog → main handlers → dispatch         │
│       · main handlers 仅当 target 为 main / * / 空时执行                     │
│                                                                            │
│  router.ts          EVENT_POLICY 校验 domain / type / source / target      │
│  sender-auth.ts     webContents.id → identity，拒绝伪造 source              │
│  request-tracker.ts pending + expectedResponder + 超时 / 容量 / sweep       │
│  audit.ts           异步队列 → logs/ipc-audit-YYYY-MM-DD.log                │
│  errors.ts          normalizeBusError() → 稳定 BusErrorCode                │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────────┐
│                           main-app（主进程编排层）                            │
│                                                                            │
│  main.ts             初始化 bus、state，注册 handler，创建窗体                 │
│  handlers.ts         LOCK_CUSTOMER / RISK_CHECK（main 侧回包）               │
│  windows.ts          开发读项目根 / 打包读 dist-runtime（路径约定写死）         │
│  window-registry.ts  MAIN_WINDOW_REGISTRY                                  │
└────────────────────────────────────────────────────────────────────────────┘
                                 ▲
┌────────────────────────────────┴───────────────────────────────────────────┐
│                            shared（协议中心）                                 │
│                                                                            │
│  protocol.ts   WINDOW_IDENTITIES / DOMAINS / EVENT_POLICY（唯一事实来源）    │
│  types.ts      BusEvent / EventMap / RequestMap / ResponseMap / BusErrorCode│
└────────────────────────────────────────────────────────────────────────────┘
```

### 两层 API 为何不一致

| 层 | API | 职责 |
|---|---|---|
| `createBusClient` | `emit` / `request` / `respond` / `on` | 业务 SDK：补身份、拼回包、按 type 订阅 |
| `window.__bus`（preload） | `emit` / `ack` / `request` / `on` | IPC 运输层：通道映射，无业务语义 |

页面**只应使用** `createBusClient`；`__bus.ack` 是 `respond` 的内部通道。

### 最小阅读路径

1. `shared/protocol.ts` — 事件白名单  
2. `event-bus-core/bus.ts` — emit 管线  
3. `main-app/handlers.ts` — 主进程回包  
4. `renderer/workbench/app.js` — 渲染端发起请求  

---

## IPC 通信模式

业务侧两种模式（均经同一条总线）：

### 1. Fire-and-forget（`emit`）

```
Renderer ──bus:emit──▶ 主进程 deliver ──dispatch──▶ 目标 Renderer
```

适用于不需要响应的通知，如 `TICKET_DONE`。

### 2. Request / Response（`request` + `respond`）

```
发起方 request ──bus:request──▶ 主进程 register(pending, expectedResponder=target)
                                    └──▶ emit/deliver ──▶ 目标
目标 respond() ──bus:ack──▶ tryCompletePendingReply（校验 source/type）
                         ◀────────────── BusResponse<T>
```

约定：
- 响应与请求**同 type**，用 `replyTo` 关联，无独立 `*_RESULT` 事件
- 仅原请求 `target`（`expectedResponder`）可合法回包，防止跨窗体劫持
- 无对应 pending 的 `replyTo` 视为 `orphan_reply`，**不会**当作新事件分发
- 合法回包也会走 `auditLog`（可用 `replyTo` 区分请求/响应）

---

## 事件协议

白名单唯一来源：`shared/protocol.ts` 的 `EVENT_POLICY`。

| 事件类型 | Domain | 发起方 | 目标 | 模式 |
|---|---|---|---|---|
| `OUTBOUND_DISPATCH` | cti | workbench | dialer | Request/Response |
| `LOCK_CUSTOMER` | crm | workbench | main | Request/Response |
| `TICKET_ACCEPT` | ticket | workbench | partner:auto | Request/Response |
| `TICKET_DONE` | ticket | partner:auto | workbench | Fire-and-forget |
| `RISK_CHECK` | risk | workbench | main | Request/Response |

响应 payload 形状见 `shared/types.ts` 的 `ResponseMap`。

---

## 目录结构

```
.
├── main.ts                          # 主进程入口
├── main-app/
│   ├── handlers.ts                  # LOCK_CUSTOMER / RISK_CHECK
│   ├── window-registry.ts           # 窗体注册中心
│   └── windows.ts                   # 创建窗体；开发/打包资源根约定
│
├── event-bus-core/
│   ├── bus.ts                       # IPC 桥接 + emit 管线 + dispatch
│   ├── router.ts                    # EVENT_POLICY 校验
│   ├── sender-auth.ts               # 发送者身份校验
│   ├── request-tracker.ts           # pending / 回包授权 / 超时 / 容量
│   ├── audit.ts                     # 异步审计日志
│   └── errors.ts                    # 错误码归一化
│
├── event-bus-client/
│   ├── client.ts                    # SDK：emit / request / respond / on
│   ├── preload.js                   # __bus 运输层（含内部 ack）
│   └── index.ts                     # UMD 入口
│
├── shared/
│   ├── protocol.ts                  # 协议中心
│   └── types.ts                     # 共享类型与错误码
│
├── renderer/
│   ├── workbench/                   # 主控台（请求发起方）
│   ├── dialer/                      # 外呼窗
│   └── partner/auto/                # 工单窗
│
├── tests/event-bus-core/            # 总线核心单测
├── scripts/build-runtime-assets.js  # 生成 dist-runtime（打包用）
├── dist/                            # tsc 产物
├── dist-umd/                        # 渲染端 UMD
└── dist-runtime/                    # 打包资源副本
```

---

## 快速开始

```bash
npm install
npm start          # build:dev（tsc + umd）后启动；开发态直接读项目根
npm test           # 总线核心单测
npm run build:all  # 含 dist-runtime，供打包安装包
```

### 资源加载约定

| 环境 | 资源根 | 说明 |
|---|---|---|
| 开发（`npm start`） | `app.getAppPath()`（项目根） | 读 `renderer/` + `event-bus-client/preload.js`，不生成 `dist-runtime` |
| 打包（`app.isPackaged`） | `app.getAppPath()/dist-runtime` | 由 `build:runtime` 拷贝 renderer / preload / UMD |

---

## 安全模型

| 防护点 | 实现位置 | 说明 |
|---|---|---|
| 最小暴露面 | `preload.js` | 只暴露 `__bus`，不暴露完整 `ipcRenderer` |
| 上下文隔离 | `windows.ts` | `contextIsolation: true`，`nodeIntegration: false` |
| sender 身份 | `sender-auth.ts` | `webContents.id` 绑定 identity，拒绝伪造 `source` |
| 协议白名单 | `router.ts` | domain / type / source / target |
| 回包授权 | `request-tracker.ts` | 仅 `expectedResponder` + 同 type 可完成 pending |
| 孤儿回包 | `bus.ts` | 无 pending 的 `replyTo` → `orphan_reply`，不分发 |
| 容量 / 重复 id | `request-tracker.ts` | over_capacity / duplicate_request |

---

## 新增业务窗体

1. **`shared/protocol.ts`** — `WINDOW_IDENTITIES` + `EVENT_POLICY`（必要时扩展 `DOMAINS`）  
2. **`shared/types.ts`** — `EventMap` / `ResponseMap`；请求类用 `Pick` 纳入 `RequestMap`  
3. **`main-app/window-registry.ts`** — 增加窗体配置  
4. **`renderer/<name>/`**，若目标为 `main` 再改 **`main-app/handlers.ts`**  

---

## 构建产物

| 目录 | 用途 |
|---|---|
| `dist/` | 主进程（tsc） |
| `dist-umd/` | 渲染端 SDK（rollup UMD） |
| `dist-runtime/` | **仅打包**；安装包内统一资源 |
| `logs/` | `ipc-audit-*.log`（JSONL，按天） |

---

## 技术栈

| 依赖 | 版本 | 用途 |
|---|---|---|
| electron | ^39 | 主框架 |
| uuid | ^13 | 事件 id |
| typescript | ^5.6 | 类型系统 |
| rollup | ^4 | 渲染端 UMD |
