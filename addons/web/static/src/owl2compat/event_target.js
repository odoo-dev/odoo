(function () {
    const { EventBus } = owl;

    owl.EventBus = class extends EventBus {
        constructor(...args) {
            super(...args);
            this.targetsCallbacks = new Map();
        }
        on(type, target, callback) {
            if (!this.targetsCallbacks.has(target)) {
                this.targetsCallbacks.set(target, []);
            }
            this.targetsCallbacks.get(target).push(callback);
            return this.addEventListener(type, callback);
        }
        off(type, target) {
            for (const callback of this.targetsCallbacks.get(target)) {
                this.removeEventListener(type, callback);
            }
        }
    };
})();
