import { Localization } from "../core/localization";
import type { UserCompany, Service, OdooEnv } from "../types";

interface Context {
  lang: string;
  tz: string;
  uid: number;
  allowed_company_ids: number[];
  [key: string]: any;
}

export interface UserService extends Localization {
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
}

export const userService: Service<UserService> = {
  name: "user",
  deploy(env: OdooEnv, config): UserService {
    const { odoo, localization } = config;
    const info = odoo.session_info;
    const {
      user_context,
      username,
      name,
      is_admin,
      partner_id,
      user_companies,
      home_action_id,
    } = info;
    let context: Context = {
      lang: user_context.lang,
      tz: user_context.tz,
      uid: info.uid,
      allowed_company_ids: user_companies.allowed_companies.map(([id]) => id),
    };

    return {
      dateFormat: localization.dateFormat,
      decimalPoint: localization.decimalPoint,
      direction: localization.direction,
      grouping: localization.grouping,
      multiLang: localization.multiLang,
      thousandsSep: localization.thousandsSep,
      timeFormat: localization.timeFormat,
      context,
      get userId() {
        return context.uid;
      },
      name,
      userName: username,
      isAdmin: is_admin,
      partnerId: partner_id,
      // LPE FIXME: allowed_companies should be retrievec from url if present, otherwise should be current company
      allowed_companies: user_companies.allowed_companies,
      current_company: user_companies.current_company,
      get lang() {
        return context.lang;
      },
      get tz() {
        return context.tz;
      },
      home_action_id,
    };
  },
};
