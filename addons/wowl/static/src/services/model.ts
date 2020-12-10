import { Component } from "@odoo/owl";
import { Service, OdooEnv } from "../types";
import { DomainListRepr } from "../core/domain";
import { RPC } from "./rpc";
import { Context } from "../core/context";

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
interface Group {
  __count: number;
  __domain: DomainListRepr;
  [key: string]: any;
}

export interface ReadGroupResult {
  length: number;
  groups: Group[];
}

interface SearchReadOptions {
  offset?: number;
  limit?: number;
  order?: string;
}

interface WebSearchReadResult {
  length: number;
  records: DBRecord[];
}

type SearchReadResult = DBRecord[];

export interface Model {
  create(state: Partial<DBRecord>, ctx?: Context): Promise<number>;
  read(ids: number[], fields: string[], ctx?: Context): Promise<DBRecord[]>;
  readGroup(
    domain: DomainListRepr,
    fields: string[],
    groupby: string[],
    options?: GroupByOptions,
    ctx?: Context
  ): Promise<ReadGroupResult>;
  search(domain: DomainListRepr, options?: SearchReadOptions, ctx?: Context): Promise<number[]>;
  searchRead(
    domain: DomainListRepr,
    fields: string[],
    options?: SearchReadOptions,
    ctx?: Context
  ): Promise<SearchReadResult>;
  webSearchRead(
    domain: DomainListRepr,
    fields: string[],
    options?: SearchReadOptions,
    ctx?: Context
  ): Promise<WebSearchReadResult>;

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

function search(rpc: RPC, env: OdooEnv, model: string): Model["search"] {
  return (domain, options = {}, ctx = {}) => {
    const kwargs: any = {
      context: ctx,
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
    return callModel(rpc, env, model)("search", [domain], kwargs);
  };
}

function makeSearchRead(method: string) {
  return function (rpc: RPC, env: OdooEnv, model: string): any {
    return (domain: any, fields: any, options: any = {}, ctx: any = {}) => {
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
      return callModel(rpc, env, model)(method, [], kwargs);
    };
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
    params.args = args;
    params.kwargs = fullKwargs;
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
      const searchRead = makeSearchRead("search_read");
      const webSearchRead = makeSearchRead("web_search_read");
      return {
        get read() {
          return read(rpc, env, model);
        },
        get unlink() {
          return unlink(rpc, env, model);
        },
        get search() {
          return search(rpc, env, model);
        },
        get searchRead() {
          return searchRead(rpc, env, model);
        },
        get webSearchRead() {
          return webSearchRead(rpc, env, model);
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
