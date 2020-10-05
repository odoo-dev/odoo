import * as owl from "@odoo/owl";
import { Env } from "@odoo/owl/dist/types/component/component";
import { EventBus } from "@odoo/owl/dist/types/core/event_bus";
import type { Registries } from "./registries";
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
}

export interface EnvParams {
  browser: OdooBrowser;
  odoo: Odoo;
  registries: Registries;
  templates: string;
}

export async function makeEnv(params: EnvParams): Promise<OdooEnv> {
  const { browser, odoo, registries, templates } = params;
  const qweb = new owl.QWeb();
  qweb.addTemplates(templates);

  const env = {
    browser,
    qweb,
    bus: new owl.core.EventBus(),
    registries,
    services: {} as any,
  };

  await deployServices(env, registries.services, odoo);
  return env;
}
