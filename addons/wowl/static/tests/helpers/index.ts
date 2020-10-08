import * as owl from "@odoo/owl";
import { setTemplates } from "./utility";
const { whenReady, loadFile } = owl.utils;

let templates: string;

export async function setupTests(): Promise<void> {
  const templatesUrl = `/wowl/templates/${new Date().getTime()}`;
  templates = await loadFile(templatesUrl);
  setTemplates(templates);
  await whenReady();
}

export { OdooEnv } from "../../src/types";

export {
  makeTestOdoo,
  makeFakeUserService,
  makeFakeMenusService,
  makeFakeRPCService,
  createMockXHR,
  createMockedFetch,
} from "./mocks";

export {
  getFixture,
  makeTestConfig,
  makeTestEnv,
  mount,
  nextTick,
  makeDeferred,
  click,
} from "./utility";
