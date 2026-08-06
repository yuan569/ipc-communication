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

    function createBusClient(identity) {
        const registry = new Map();
        let subscribed = false;
        let unsubscribeBridge = null;
        function enrich(event) {
            return {
                ...event,
                source: identity,
                ts: Date.now(),
            };
        }
        function ensureSubscribed() {
            if (subscribed)
                return;
            subscribed = true;
            const maybeOff = window.__bus.on((event) => {
                const set = registry.get(event.type);
                if (!set || set.size === 0)
                    return;
                set.forEach(fn => fn(event));
            });
            if (typeof maybeOff === 'function') {
                unsubscribeBridge = maybeOff;
            }
        }
        /** 单向发送（fire-and-forget） */
        function emit(event) {
            window.__bus.emit(enrich(event));
        }
        /** 请求-响应：等待目标同 type + replyTo 回包 */
        function request(event, options) {
            return window.__bus.request(enrich(event), options);
        }
        /** 对请求回包：同 type + replyTo；走 invoke 通道以拿到授权/校验错误码 */
        function respond(to, payload) {
            const reply = enrich({
                id: v4(),
                type: to.type,
                domain: to.domain,
                payload,
                replyTo: to.id,
            });
            return window.__bus.ack(reply);
        }
        function on(type, handler) {
            ensureSubscribed();
            const set = registry.get(type) || new Set();
            set.add(handler);
            registry.set(type, set);
            return () => {
                const current = registry.get(type);
                if (!current)
                    return;
                current.delete(handler);
                if (current.size === 0)
                    registry.delete(type);
                if (registry.size === 0 && unsubscribeBridge) {
                    unsubscribeBridge();
                    unsubscribeBridge = null;
                    subscribed = false;
                }
            };
        }
        return { emit, request, respond, on };
    }

    exports.createBusClient = createBusClient;

}));
//# sourceMappingURL=event-bus-client.js.map
