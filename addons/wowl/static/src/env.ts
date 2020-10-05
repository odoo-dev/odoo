import * as owl from "@odoo/owl";
import { Env } from "@odoo/owl/dist/types/component/component";
import { EventBus } from "@odoo/owl/dist/types/core/event_bus";
import type { Registries } from "./registries";
import { LocalizationParameters } from "./core/localization";
import { deployServices, Services } from "./services";
import type { Odoo } from "./types";

type Browser = Env["browser"];
export interface OdooBrowser extends Browser {
  XMLHttpRequest: typeof window["XMLHttpRequest"];
  console: typeof window["console"];
}

export interface OdooEnv extends Env {
  browser: OdooBrowser;
  services: Services;
  registries: Registries;
  bus: EventBus;
  _t: (str: string) => string;
}

export interface EnvParams {
  browser: OdooBrowser;
  localizationParameters: LocalizationParameters;
  odoo: Odoo;
  registries: Registries;
  templates: string;
  _t: (str: string) => string;
}

export async function makeEnv(params: EnvParams): Promise<OdooEnv> {
  const { browser, localizationParameters, odoo, registries, templates, _t } = params;
  const qweb = new owl.QWeb({ translateFn: _t });
  qweb.addTemplates(templates);

  const env = {
    browser,
    qweb,
    bus: new owl.core.EventBus(),
    registries,
    services: {} as any,
    _t,
  };

  await deployServices(registries.services, { env, odoo, localizationParameters });
  return env;
}
