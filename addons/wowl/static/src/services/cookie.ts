import { Service } from "../types";

/**
 * Service to make use of document.cookie
 * https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies
 * As recommended, storage should not be done by the cookie
 * but with localStorage/sessionStorage
 */

const COOKIE_TTL = 24 * 60 * 60 * 365;

export interface Cookie {
  [key: string]: string;
}

interface CookieService {
  current: Cookie;
  setCookie(key: string, value: string | undefined, ttl?: number): void;
  deleteCookie(key: string): void;
}

function parseCookieString(str: string): Cookie {
  const cookie: Cookie = {};
  const parts = str.split("; ");
  for (let part of parts) {
    const [key, value] = part.split("=");
    cookie[key] = value || "";
  }
  return cookie;
}

function cookieToString(key: string, value: string | undefined, ttl: number = COOKIE_TTL): string {
  let fullCookie = [];
  if (value !== undefined) {
    fullCookie.push(`${key}=${value}`);
  }
  fullCookie = fullCookie.concat([
    "path=/",
    `max-age=${ttl}`, // Do we need 'expires' as well ?
  ]);
  return fullCookie.join(";");
}

function makeCookieService() {
  function getCurrent(): Cookie {
    return parseCookieString(document.cookie);
  }
  let cookie = getCurrent();

  function setCookie(key: string, value: string | undefined, ttl?: number) {
    document.cookie = cookieToString(key, value, ttl);
    cookie = getCurrent();
  }

  return {
    get current() {
      return cookie;
    },
    setCookie,
    deleteCookie(key: string) {
      setCookie(key, "kill", 0);
    },
  };
}

export const cookieService: Service<CookieService> = {
  name: "cookie",
  deploy() {
    return makeCookieService();
  },
};
