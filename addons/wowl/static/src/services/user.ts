import type { UserCompany, Service, OdooEnv } from "../types";
interface Context {
  lang: string;
  tz: string;
  uid: number;
  allowed_company_ids: number[];
  [key: string]: any;
}

export interface UserService {
  context: Context;
  userId: number;
  name: string;
  userName: string;
  isAdmin: boolean;
  partnerId: number;
  allowed_companies: UserCompany[];
  current_company: UserCompany;
  lang: string;
  tz: string;
  home_action_id?: number | false;
  db: string;
  showEffect: boolean;
}

function computeAllowedCompanyIds(env: OdooEnv): number[] {
  const { cookie, router } = env.services;
  const { user_companies } = odoo.session_info;
  let cids: string | undefined;
  if ("cids" in router.current.hash) {
    cids = router.current.hash.cids!;
  } else if ("cids" in cookie.current) {
    cids = cookie.current.cids;
  }
  let allowedCompanies: number[] = cids ? cids.split(",").map((id) => parseInt(id, 10)) : [];
  const allowedCompaniesFromSession = user_companies.allowed_companies.map(([id, name]) => id);
  const notReallyAllowedCompanies = allowedCompanies.filter(
    (id) => !allowedCompaniesFromSession.includes(id)
  );
  if (!allowedCompanies.length || notReallyAllowedCompanies.length) {
    allowedCompanies = [user_companies.current_company[0]];
  }
  return allowedCompanies;
}

export const userService: Service<UserService> = {
  name: "user",
  dependencies: ["router", "cookie"],
  deploy(env: OdooEnv): UserService {
    const info = odoo.session_info;
    const {
      user_context,
      username,
      name,
      is_admin,
      partner_id,
      user_companies,
      home_action_id,
      db,
      show_effect: showEffect,
    } = info;

    const allowedCompanies = computeAllowedCompanyIds(env);
    let context: Context = {
      lang: user_context.lang,
      tz: user_context.tz,
      uid: info.uid,
      allowed_company_ids: allowedCompanies,
    };

    const cids: string = allowedCompanies.join(",");
    env.services.router.replaceState({ cids });
    env.services.cookie.setCookie("cids", cids);

    return {
      context,
      get userId() {
        return context.uid;
      },
      name,
      userName: username,
      isAdmin: is_admin,
      partnerId: partner_id,
      allowed_companies: user_companies.allowed_companies,
      current_company: user_companies.current_company,
      get lang() {
        return context.lang;
      },
      get tz() {
        return context.tz;
      },
      home_action_id,
      db,
      showEffect,
    };
  },
};
