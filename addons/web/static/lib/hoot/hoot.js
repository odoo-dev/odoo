/** @odoo-module */

import { mount, whenReady } from "@odoo/owl";
import { makeCleanup } from "./core/cleanup";
import { makeLogger } from "./core/logger";
import { makeExpect } from "./core/expect";
import { TestRunner } from "./core/runner";
import { HootMain } from "./ui/hoot_main";
import { makeTaggable } from "./utils";

/**
 * @typedef {{
 *  runner: TestRunner;
 *  url: TestRunner["url"];
 * }} Environment
 */

const runner = new TestRunner();

whenReady(async () =>
    mount(HootMain, document.body, {
        dev: true, // TODO: remove when the lib is stable
        env: { runner },
        name: "HOOT",
    })
);

export const __debug__ = { runner };

/**
 * @template {keyof TestRunner} T
 * @param {T} fn
 * @returns {TestRunner[T]}
 */
const exportRunnerFunction = (fn) => runner[fn].bind(runner);

export const afterAll = exportRunnerFunction("afterAll");
export const afterSuite = exportRunnerFunction("afterSuite");
export const afterEach = exportRunnerFunction("afterEach");
export const beforeAll = exportRunnerFunction("beforeAll");
export const beforeSuite = exportRunnerFunction("beforeSuite");
export const beforeEach = exportRunnerFunction("beforeEach");
export const describe = makeTaggable(exportRunnerFunction("addSuite"));
export const expect = makeExpect(runner);
export const getCurrent = exportRunnerFunction("getCurrent");
export const registerCleanup = exportRunnerFunction("registerCleanup");
export const start = exportRunnerFunction("start");
export const test = makeTaggable(exportRunnerFunction("addTest"));

makeLogger(runner);
makeCleanup(runner);
