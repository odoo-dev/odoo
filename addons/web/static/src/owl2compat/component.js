(function () {
    const { Component, useComponent } = owl;
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
            if (this.catchError) {
                owl.onError((error) => {
                    this.catchError(error);
                });
            }
        }

        static get current() {
            return useComponent();
        }

        // get el() {
        //     let bdom = this.__owl__.bdom;
        //     while (bdom && !bdom.el) {
        //         bdom = bdom.child || bdom.children[0] || bdom.bdom;
        //     }
        //     return bdom.el;
        // }

        /**
         * Emit a custom event of type 'eventType' with the given 'payload' on the
         * component's el, if it exists. However, note that the event will only bubble
         * up to the parent DOM nodes. Thus, it must be called between mounted() and
         * willUnmount().
         */
        trigger(eventType, payload) {
            this.__trigger(eventType, payload);
        }
        /**
         * Private trigger method, allows to choose the component which triggered
         * the event in the first place
         */
        __trigger(eventType, payload) {
            if (this.el) {
                const ev = new CustomEvent(eventType, {
                    bubbles: true,
                    cancelable: true,
                    detail: payload,
                });
                this.el.dispatchEvent(ev);
            }
        }
    };
    owl.Component.env = {};

    Object.defineProperty(owl.Component, "components", {
        get() {
            return Object.assign({}, owl.Component._components, this._components);
        },
        set(val) {
            this._components = val;
        },
    });
    owl.Component._components = {};
})();
