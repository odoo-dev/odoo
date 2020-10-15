import type { Service, OdooEnv } from "../types";

type Query = { [key: string]: string };

export interface Route {
  pathname: string;
  search: Query;
  hash: Query;
}

export interface Router {
  current: Route;
  pushState(hash: Query, replace?: boolean): void;
}

function parseString(str: string): Query {
  const parts = str.split("&");
  const result: Query = {};
  for (let part of parts) {
    const [key, value] = part.split("=");
    result[key] = value || "";
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
    .map(([k, v]) => (v ? `${k}=${v}` : k))
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

  return {
    get current(): Route {
      return current;
    },
    pushState(hash: Query, replace: boolean = false) {
      if (!replace) {
        hash = Object.assign({}, current.hash, hash);
      }
      const route = Object.assign({}, current, { hash });
      const url = location.origin + routeToUrl(route);
      if (url !== window.location.href) {
        window.history.pushState({}, url, url);
      }
      current = getRoute();
    },
  };
}

export const routerService: Service<Router> = {
  name: "router",
  deploy(env: OdooEnv): Router {
    return makeRouter(env);
  },
};
