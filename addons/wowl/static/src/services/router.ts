import type { Service, OdooEnv } from "../types";

export type Query = { [key: string]: string | undefined };

export interface Route {
  pathname: string;
  search: Query;
  hash: Query;
}

export interface Router {
  current: Route;
  pushState(hash: Query, replace?: boolean): void;
  replaceState(hash: Query, replace?: boolean): void;
}

function parseString(str: string): Query {
  const parts = str.split("&");
  const result: Query = {};
  for (let part of parts) {
    const [key, value] = part.split("=");
    result[key] = decodeURIComponent(value || "");
  }
  return result;
}

export function parseHash(hash: string): Query {
  return hash === "#" || hash === "" ? {} : parseString(hash.slice(1));
}

export function parseSearchQuery(search: string): Query {
  return search === "" ? {} : parseString(search.slice(1));
}

function toString(query: Query): string {
  return Object.entries(query)
    .filter(([k, v]) => v !== undefined)
    .map(([k, v]) => (v ? `${k}=${encodeURIComponent(v)}` : k))
    .join("&");
}

export function routeToUrl(route: Route): string {
  const search = toString(route.search);
  const hash = toString(route.hash);
  return route.pathname + (search ? "?" + search : "") + (hash ? "#" + hash : "");
}

function getRoute(): Route {
  const { pathname, search, hash } = window.location;
  const searchQuery = parseSearchQuery(search);
  const hashQuery = parseHash(hash);
  return { pathname, search: searchQuery, hash: hashQuery };
}

function makeRouter(env: OdooEnv) {
  let bus = env.bus;
  let current = getRoute();

  window.addEventListener("hashchange", () => {
    current = getRoute();
    bus.trigger("ROUTE_CHANGE");
  });

  function doPush(mode: "push" | "replace" = "push", route: Route) {
    const url = location.origin + routeToUrl(route);
    if (url !== window.location.href) {
      if (mode === "push") {
        window.history.pushState({}, url, url);
      } else {
        window.history.replaceState({}, url, url);
      }
    }
    current = getRoute();
  }

  function getCurrent(): Route {
    return current;
  }

  return {
    get current(): Route {
      return getCurrent();
    },
    pushState: makePushState(env, getCurrent, doPush.bind(null, "push")),
    replaceState: makePushState(env, getCurrent, doPush.bind(null, "replace")),
  };
}

export function makePushState(
  env: OdooEnv,
  getCurrent: () => Route,
  doPush: (route: Route) => void
): Router["pushState"] {
  let _replace: boolean = false;
  let timeoutId: number | undefined;
  let tempHash: any;
  return (hash: Query, replace: boolean = false) => {
    clearTimeout(timeoutId);
    _replace = _replace || replace;
    tempHash = Object.assign(tempHash || {}, hash);
    timeoutId = setTimeout(() => {
      const current = getCurrent();
      if (!_replace) {
        tempHash = Object.assign({}, current.hash, tempHash);
      }
      const route = Object.assign({}, current, { hash: tempHash });
      doPush(route);
      tempHash = undefined;
      timeoutId = undefined;
      _replace = false;
    });
  };
}

export const routerService: Service<Router> = {
  name: "router",
  deploy(env: OdooEnv): Router {
    return makeRouter(env);
  },
};

export function objectToQuery(obj: {[k: string]: any}): Query {
  const query: Query = {};
  Object.entries(obj).forEach(([k, v]) => {
    query[k] = v ? `${v}` : v;
  });
  return query;
}
