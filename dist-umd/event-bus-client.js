(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.BusClient = {}));
})(this, (function (exports) { 'use strict';

    const byteToHex = [];
    for (let i = 0; i < 256; ++i) {
        byteToHex.push((i + 0x100).toString(16).slice(1));
    }
    function unsafeStringify(arr, offset = 0) {
        return (byteToHex[arr[offset + 0]] +
            byteToHex[arr[offset + 1]] +
            byteToHex[arr[offset + 2]] +
            byteToHex[arr[offset + 3]] +
            '-' +
            byteToHex[arr[offset + 4]] +
            byteToHex[arr[offset + 5]] +
            '-' +
            byteToHex[arr[offset + 6]] +
            byteToHex[arr[offset + 7]] +
            '-' +
            byteToHex[arr[offset + 8]] +
            byteToHex[arr[offset + 9]] +
            '-' +
            byteToHex[arr[offset + 10]] +
            byteToHex[arr[offset + 11]] +
            byteToHex[arr[offset + 12]] +
            byteToHex[arr[offset + 13]] +
            byteToHex[arr[offset + 14]] +
            byteToHex[arr[offset + 15]]).toLowerCase();
    }

    let getRandomValues;
    const rnds8 = new Uint8Array(16);
    function rng() {
        if (!getRandomValues) {
            if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
                throw new Error('crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported');
            }
            getRandomValues = crypto.getRandomValues.bind(crypto);
        }
        return getRandomValues(rnds8);
    }

    const randomUUID = typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID.bind(crypto);
    var native = { randomUUID };

    function _v4(options, buf, offset) {
        options = options || {};
        const rnds = options.random ?? options.rng?.() ?? rng();
        if (rnds.length < 16) {
            throw new Error('Random bytes length must be >= 16');
        }
        rnds[6] = (rnds[6] & 0x0f) | 0x40;
        rnds[8] = (rnds[8] & 0x3f) | 0x80;
        return unsafeStringify(rnds);
    }
    function v4(options, buf, offset) {
        if (native.randomUUID && true && !options) {
            return native.randomUUID();
        }
        return _v4(options);
    }

    /**
     * 渲染进程事件总线客户端（类型安全）
     * - 通过 preload 暴露的 window.__bus 与主进程通信
     * - 支持 on/once/off/emit，并使用本地 registry 做二次分发，避免重复绑定底层 IPC 监听
     * - 通过 EM 泛型约束不同事件 type 对应的 payload 类型，提供端到端类型安全
     *
     * 使用示例：
     *   type EM = { CALL_START: { caller: string; ticketId: string } };
     *   const bus = createBusClient<EM>('credit-system');
     *   const off = bus.on('CALL_START', (e) => console.log(e.payload.caller));
     *   bus.emit({ id, type: 'CALL_START', domain: 'call', target: '*', payload: { caller: '10086', ticketId: 'T1' } });
     */
    function createBusClient(identity) {
        const registry = new Map();
        // 是否已订阅底层 __bus 事件，仅需订阅一次，后续在本地二次分发
        let subscribed = false;
        /**
         * 确保仅绑定一次底层 __bus.on 监听
         * - 将主进程转发来的事件，按 event.type 分发给本地注册的处理器集合
         */
        function ensureSubscribed() {
            if (subscribed)
                return;
            subscribed = true;
            // 只订阅一次底层总线，内部做二次分发
            window.__bus.on((event) => {
                const set = registry.get(event.type);
                if (!set || set.size === 0)
                    return;
                set.forEach(fn => fn(event));
            });
        }
        /**
         * 发送事件到主进程（fire-and-forget）
         * - 会自动补齐 source=identity 与 ts=Date.now()
         */
        function emit(event) {
            const full = {
                ...event,
                source: identity,
                ts: Date.now()
            };
            window.__bus.emit(full);
        }
        /**
         * ACK：仅请求分发确认，不等待业务响应
         */
        function ack(event) {
            const full = {
                ...event,
                source: identity,
                ts: Date.now()
            };
            return window.__bus.ack(full);
        }
        /**
         * request：请求-响应（等待 replyTo，支持超时）
         * - 发出请求事件，等待某个渲染端 emit 带 replyTo=原 id 的响应
         * - 超时返回 { ok: false, error: 'timeout' }
         */
        function request(event, options) {
            const full = {
                ...event,
                source: identity,
                ts: Date.now()
            };
            return window.__bus.request(full, options);
        }
        /**
         * respond：对某个请求事件进行响应（通过 replyTo 关联）
         */
        function respond(to, payload) {
            const reply = {
                id: v4(),
                type: to.type,
                domain: to.domain,
                source: identity,
                payload,
                ts: Date.now(),
                replyTo: to.id
            };
            window.__bus.emit(reply);
        }
        /**
         * 订阅指定类型的事件
         * - 返回取消订阅函数，便于主动释放，避免内存泄漏
         */
        function on(type, handler) {
            ensureSubscribed();
            const set = registry.get(type) || new Set();
            set.add(handler);
            registry.set(type, set);
            // 返回取消订阅函数
            return () => off(type, handler);
        }
        /**
         * 一次性订阅：触发一次后自动取消订阅
         */
        function once(type, handler) {
            const wrapper = (e) => {
                off(type, wrapper);
                handler(e);
            };
            return on(type, wrapper);
        }
        /**
         * 取消订阅
         * - 若传入 handler，则仅移除此处理器
         * - 若未传 handler，则清空该 type 下所有处理器
         */
        function off(type, handler) {
            const set = registry.get(type);
            if (!set)
                return;
            if (handler) {
                set.delete(handler);
                if (set.size === 0)
                    registry.delete(type);
            }
            else {
                registry.delete(type);
            }
        }
        return { emit, ack, request, respond, on, once, off };
    }

    exports.createBusClient = createBusClient;

}));
//# sourceMappingURL=event-bus-client.js.map
