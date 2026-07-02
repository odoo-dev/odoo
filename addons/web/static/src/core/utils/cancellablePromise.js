const execContexts = [];

const OriginalPromise = Promise;

const originalThen = Promise.prototype.then;

// const PromiseConstructor = Promise.prototype.constructor;
// Promise.prototype.constructor = function (...args) {
//     const instance = Reflect.construct(PromiseConstructor, args, Promise);
//     console.warn("promise constructor");
//     instance.execContext = execContexts.at(-1);
//     return instance;
// };

window.Promise = new Proxy(OriginalPromise, {
    construct(target, args, newTarget) {
        const instance = Reflect.construct(target, args, newTarget);
        instance.execContext = execContexts.at(-1); // Add context
        return instance;
    },
    get(target, prop, receiver) {
        if (
            typeof target[prop] === "function" &&
            ["resolve", "reject", "all", "race", "allSettled", "any"].includes(prop)
        ) {
            return function (...args) {
                const newPromise = Reflect.apply(target[prop], target, args);
                newPromise.execContext = execContexts.at(-1); // Add context
                // console.warn(`Proxied 'Promise.${prop}()'`); // For debugging
                return newPromise;
            };
        }
        return Reflect.get(target, prop, receiver);
    },
});

Promise.prototype.then = function (onFulfilled, onRejected) {
    return originalThen.call(
        this,
        onFulfilled ? (...args) => _exec(this.execContext, onFulfilled, args) : undefined,
        onRejected ? (...args) => _exec(this.execContext, onRejected, args) : undefined
    );
};

export const _exec = (execContext, cb, args) => {
    if (execContext?.cancelled) {
        return;
    }
    execContexts.push(execContext);
    const r = cb(...args);
    originalThen.call(
        Promise.resolve(),
        () => {
            execContexts.pop();
        },
        undefined
    );
    return r;
};



export const effect = (cb) => {
    const context = { cancelled: false };
    execContexts.push(context);
    cb();
    execContexts.pop();
    return {
        cancel: () => (context.cancelled = true),
        get isCancel() {
            return context.cancelled;
        },
    };
};
