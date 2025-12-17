import { plugin, Plugin } from "@odoo/owl";
import { protect } from "@web_core/plugin_protection";
import { RPC } from "@web_core/rpc";
import { serviceRegistry } from "@web_core/services";

export class ORM extends Plugin {
    static id = "orm";
    static {
        serviceRegistry.addById(this);
    }

    /** @private */
    rpc = plugin(RPC);

    /**
     * @type {(this: ORM, model: string, method: string, options?: { args?: any[]; kwargs?: {} }) => Promise<any>}
     */
    call = protect(function call(model, method, options = {}) {
        // validateType("orm.call.model", model, String);
        // validateType("orm.call.method", method, String);
        const url = `/web/dataset/call_kw/${model}/${method}`;
        // const fullContext = Object.assign({}, user.context, kwargs.context || {});
        // const fullKwargs = Object.assign({}, kwargs, { context: fullContext });
        const params = {
            model,
            method,
            args: options.args ?? [],
            kwargs: options.kwargs ?? {},
        };
        return this.rpc.call(url, params);
    });
}
