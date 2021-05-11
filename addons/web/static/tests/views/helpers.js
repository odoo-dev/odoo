/** @odoo-module **/

import { getFixture } from "@web/../tests/helpers/utils";
import { makeTestEnv } from "@web/../tests/helpers/mock_env";
import { registerCleanup } from "@web/../tests/helpers/cleanup";
import { View } from "@web/views/view_utils/view/view";

const { mount } = owl;

/**
 * @typedef {import("../../src/views/view_utils/view/view_types").ViewProps} ViewProps
 */

/**
 * @param {Object} params
 * @param {Object} [params.serverData]
 * @param {Function} [params.mockRPC]
 * @param {ViewProps} props
 * @param {Component}
 */
export async function makeView(params, props) {
    const serverData = params.serverData || undefined;
    const mockRPC = params.mockRPC || undefined;
    const env = await makeTestEnv({ serverData, mockRPC });
    const target = getFixture();
    const view = await mount(View, { env, props, target });
    registerCleanup(() => view.destroy());
    const withSearch = Object.values(view.__owl__.children)[0];
    const concreteView = Object.values(withSearch.__owl__.children)[0];
    return concreteView;
}
