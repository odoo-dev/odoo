/** @odoo-module **/

import { useService } from "./service_hook";
import { registry } from "./registry";

/**
 * This ORM service is the standard way to interact with the ORM in python from
 * the javascript codebase.
 */

// -----------------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------------
function assignOptions(kwargs, options, whileList) {
    for (let elem of whileList) {
        if (elem in options) {
            kwargs[elem] = options[elem];
        }
    }
}

// -----------------------------------------------------------------------------
// ORM
// -----------------------------------------------------------------------------

/**
 * One2many and Many2many fields expect a special command to manipulate the
 * relation they implement.
 *
 * Internally, each command is a 3-elements tuple where the first element is a
 * mandatory integer that identifies the command, the second element is either
 * the related record id to apply the command on (commands update, delete,
 * unlink and link) either 0 (commands create, clear and set), the third
 * element is either the ``values`` to write on the record (commands create
 * and update) either the new ``ids`` list of related records (command set),
 * either 0 (commands delete, unlink, link, and clear).
 */
export const Commands = {
    create(virtualID, values) {
        delete values.id;
        return [0, virtualID || false, values];
    },

    update(id, values) {
        delete values.id;
        return [1, id, values];
    },

    delete(id) {
        return [2, id, false];
    },

    forget(id) {
        return [3, id, false];
    },

    linkTo(id) {
        return [4, id, false];
    },

    deleteAll() {
        return [5, false, false];
    },

    replaceWith(ids) {
        return [6, false, ids];
    },
};

class ORM {
    constructor(rpc, user) {
        this.rpc = rpc;
        this.user = user;
    }

    call(model, method, args = [], kwargs = {}) {
        let url = `/web/dataset/call_kw/${model}/${method}`;
        const fullContext = Object.assign({}, this.user.context, kwargs.context || {});
        const fullKwargs = Object.assign({}, kwargs, { context: fullContext });
        let params = {
            model,
            method,
            args,
            kwargs: fullKwargs,
        };
        return this.rpc(url, params);
    }

    create(model, state, ctx) {
        return this.call(model, "create", [state], { context: ctx });
    }

    read(model, ids, fields, ctx) {
        return this.call(model, "read", [ids, fields], { context: ctx });
    }

    unlink(model, ids, ctx) {
        return this.call(model, "unlink", [ids], { context: ctx });
    }

    write(model, ids, data, ctx) {
        return this.call(model, "write", [ids, data], { context: ctx });
    }

    search(model, domain, options = {}, ctx = {}) {
        const kwargs = {
            context: ctx,
        };
        assignOptions(kwargs, options, ["offset", "limit", "order"]);
        return this.call(model, "search", [domain], kwargs);
    }

    readGroup(model, domain, fields, groupby, options = {}, ctx = {}) {
        const kwargs = {
            domain,
            groupby,
            fields,
            context: ctx,
        };
        assignOptions(kwargs, options, ["lazy", "offset", "orderby", "limit"]);
        return this.call(model, "web_read_group", [], kwargs);
    }

    searchRead(model, domain, fields, options = {}, ctx = {}) {
        const kwargs = { context: ctx, domain, fields };
        assignOptions(kwargs, options, ["offset", "limit", "order"]);
        return this.call(model, "search_read", [], kwargs);
    }

    webSearchRead(model, domain, fields, options = {}, ctx = {}) {
        const kwargs = { context: ctx, domain, fields };
        assignOptions(kwargs, options, ["offset", "limit", "order"]);
        return this.call(model, "web_search_read", [], kwargs);
    }
}

/**
 * Note:
 *
 * when we will need a way to configure a rpc (for example, to setup a "shadow"
 * flag, or some way of not displaying errors), we can use the following api:
 *
 * this.orm = useService('orm');
 *
 * ...
 *
 * const result = await this.orm.withOption({shadow: true}).read('res.partner', [id]);
 */
export const ormService = {
    dependencies: ["rpc", "user"],
    start(env, { rpc, user }) {
        return new ORM(rpc, user);
    },
    specializeForComponent() {
        const rpc = useService("rpc");
        const user = useService("user");
        return new ORM(rpc, user);
    },
};

registry.category("services").add("orm", ormService);
