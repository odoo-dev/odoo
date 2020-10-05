import type { Component } from "@odoo/owl";

interface CacheHashes {
  load_menus: string;
  translations: string;
}

interface UserContext {
  lang: string;
  tz: string;
  uid: number;
}

export type UserCompany = [number, string];

interface UserCompanies {
  allowed_companies: UserCompany[];
  current_company: UserCompany;
}

export interface SessionInfo {
  cache_hashes: CacheHashes;
  user_context: UserContext;
  qweb: string;
  uid: number;
  username: string;
  is_admin: boolean;
  partner_id: number;
  user_companies: UserCompanies;
  db: string;
  server_version: string;
  server_version_info: (number | string)[];
}

export interface Odoo {
  session_info: SessionInfo;
}

interface DBInfo {
  db: string;
  server_version: string;
  server_version_info: (number | string)[];
}

interface Debug {
  root: Component;
}

export interface RuntimeOdoo {
  __DEBUG__: Debug;
  info: DBInfo;
}

export interface Type<T> extends Function {
  new (...args: any[]): T;
}
