(function () {
    const { Component } = owl;
    const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
    const oldLifecycleMethods = [
        "mounted",
        "willStart",
        "willUnmount",
        "willPatch",
        "patched",
        "willUpdateProps",
    ];

    owl.Component = class extends Component {
        constructor(...args) {
            super(...args);
            for (const methodName of oldLifecycleMethods) {
                const hookName = "on" + capitalize(methodName);
                const method = this[methodName];
                if (typeof method === "function") {
                    owl[hookName](method.bind(this));
                }
            }
        }
    };
})();
