import { Component } from "@odoo/owl";
import { Context, Domain, Service, OdooEnv } from "../types";
import { RPC } from "./rpc";

export type ORMCommand = [0 | 1 | 2 | 3 | 4 | 5 | 6, false | number, Partial<DBRecord> | number[]];

export interface DBRecord {
  id: number;
  [field: string]: any;
}

type KWargs = { [key: string]: any };

interface GroupByOptions {
  lazy?: boolean;
  limit?: number;
  offset?: number;
  orderby?: string;
}

// todo: describe (and normalize if necessary) group results
interface GroupResult {}

interface ReadGroupResult {
  length: number;
  groups: GroupResult[];
}

interface SearchReadOptions {
  offset?: number;
  limit?: number;
  order?: string;
}

interface SearchReadResult {
  length: number;
  records: DBRecord[];
}

export interface Model {
  create(state: Partial<DBRecord>, ctx?: Context): Promise<number>;
  read(ids: number[], fields: string[], ctx?: Context): Promise<DBRecord[]>;
  readGroup(
    domain: Domain,
    fields: string[],
    groupby: string[],
    options?: GroupByOptions,
    ctx?: Context
  ): Promise<ReadGroupResult>;
  searchRead(
    domain: Domain,
    fields: string[],
    options?: SearchReadOptions,
    ctx?: Context
  ): Promise<SearchReadResult>;

  // raise an error if id already deleted
  unlink(ids: number[], ctx?: Context): Promise<true>;

  // can it return false?
  write(ids: number[], data: Partial<DBRecord>, context?: Context): Promise<boolean>;

  call(method: string, args?: any[], kwargs?: KWargs): Promise<any>;
}

export type ModelBuilder = (model: string) => Model;

function read(rpc: RPC, env: OdooEnv, model: string): Model["read"] {
  return (ids, fields, ctx) => callModel(rpc, env, model)("read", [ids, fields], { context: ctx });
}

function create(rpc: RPC, env: OdooEnv, model: string): Model["create"] {
  return (state, ctx) => callModel(rpc, env, model)("create", [state], { context: ctx });
}

function unlink(rpc: RPC, env: OdooEnv, model: string): Model["unlink"] {
  return (ids, ctx) => callModel(rpc, env, model)("unlink", [ids], { context: ctx });
}

function write(rpc: RPC, env: OdooEnv, model: string): Model["write"] {
  return (ids, data, ctx) => callModel(rpc, env, model)("write", [ids, data], { context: ctx });
}

function readGroup(rpc: RPC, env: OdooEnv, model: string): Model["readGroup"] {
  return (domain, fields, groupby, options = {}, ctx = {}) => {
    const kwargs: any = {
      context: ctx,
    };
    if (options.lazy) {
      kwargs.lazy = options.lazy;
    }
    if (options.offset) {
      kwargs.offset = options.offset;
    }
    if (options.orderby) {
      kwargs.orderby = options.orderby;
    }
    if (options.limit) {
      kwargs.limit = options.limit;
    }
    return callModel(rpc, env, model)("web_read_group", [domain, fields, groupby], kwargs);
  };
}

function searchRead(rpc: RPC, env: OdooEnv, model: string): Model["searchRead"] {
  return (domain, fields, options = {}, ctx = {}) => {
    const kwargs: any = {
      context: ctx,
      domain,
      fields,
    };
    if (options.offset) {
      kwargs.offset = options.offset;
    }
    if (options.limit) {
      kwargs.limit = options.limit;
    }
    if (options.order) {
      kwargs.order = options.order;
    }
    return callModel(rpc, env, model)("search_read", [], kwargs);
  };
}

function callModel(rpc: RPC, env: OdooEnv, model: string): Model["call"] {
  const user = env.services.user;
  return (method, args = [], kwargs = {}) => {
    let url = `/web/dataset/call_kw/${model}/${method}`;
    const fullContext = Object.assign({}, user.context, kwargs.context || {});
    const fullKwargs = Object.assign({}, kwargs, { context: fullContext });
    let params: any = {
      model,
      method,
    };
    // yes or no???
    if (method === "search_read") {
      url = `/web/dataset/search_read`;
      params = Object.assign(params, { context: fullContext }, fullKwargs);
    } else {
      params.args = args;
      params.kwargs = fullKwargs;
    }
    return rpc(url, params);
  };
}

/**
 * Note:
 *
 * when we will need a way to configure a rpc (for example, to setup a "shadow"
 * flag, or some way of not displaying errors), we can use the following api:
 *
 * this.model = useService('model);
 *
 * ...
 *
 * const result = await this.model('res.partner').configure({shadow: true}).read([id]);
 */

export const modelService: Service<ModelBuilder> = {
  name: "model",
  dependencies: ["rpc", "user"],
  deploy(env: OdooEnv) {
    return function (this: Component | null, model: string): Model {
      const rpc = this instanceof Component ? env.services.rpc.bind(this) : env.services.rpc;
      return {
        get read() {
          return read(rpc, env, model);
        },
        get unlink() {
          return unlink(rpc, env, model);
        },
        get searchRead() {
          return searchRead(rpc, env, model);
        },
        get create() {
          return create(rpc, env, model);
        },
        get write() {
          return write(rpc, env, model);
        },
        get readGroup() {
          return readGroup(rpc, env, model);
        },
        get call() {
          return callModel(rpc, env, model);
        },
      };
    };
  },
};
