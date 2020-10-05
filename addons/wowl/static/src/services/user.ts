import { LocalizationParameters } from "../core/localization";
import { ServiceParams } from "../services";
import type { UserCompany } from "../types";

interface Context {
  lang: string;
  tz: string;
  uid: number;
  allowed_company_ids: number[];
  [key: string]: any;
}

export interface UserService extends LocalizationParameters {
  context: Context;
  userId: number;
  userName: string;
  isAdmin: boolean;
  partnerId: number;
  allowed_companies: UserCompany[];
  current_company: UserCompany;
  lang: string;
  tz: string;
}

export const userService = {
  name: "user",
  deploy(params: ServiceParams): UserService {
    const { odoo, localizationParameters } = params;
    const info = odoo.session_info;
    const { user_context, username, is_admin, partner_id, user_companies } = info;
    let context: Context = {
      lang: user_context.lang,
      tz: user_context.tz,
      uid: info.uid,
      allowed_company_ids: user_companies.allowed_companies.map(([id]) => id),
    };

    return {
      dateFormat: localizationParameters.dateFormat,
      decimalPoint: localizationParameters.decimalPoint,
      direction: localizationParameters.direction,
      grouping: localizationParameters.grouping,
      multiLang: localizationParameters.multiLang,
      thousandsSep: localizationParameters.thousandsSep,
      timeFormat: localizationParameters.timeFormat,
      context,
      get userId() {
        return context.uid;
      },
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
    };
  },
};
