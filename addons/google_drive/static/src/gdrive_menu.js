/** @odoo-module */
import { registry } from "@web/core/registry";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { useService } from "@web/core/utils/hooks";
import { browser } from "@web/core/browser/browser";

/**
 * @typedef {import("@web/env").OdooEnv} OdooEnv
 */

/**
 * Fetches the google drive action menu item props. To do so this function
 * is given its parent props and env, as well as the RPC function bound to
 * the parent context.
 * Note that we use the bound RPC to benefit from its added behaviour (see
 * web/component_extension).
 * @param {Object} props
 * @param {number[]} props.activeIds
 * @param {Object} props.context
 * @param {OdooEnv} env
 * @returns {Object | boolean} item props or false
 */
async function googleDrivePropsGetter(props, env) {
    const [activeId] = props.activeIds;
    const { context } = props;
    if (env.config.viewType !== "form" || !activeId) {
        return false;
    }
    const items = await env.services.orm.call(
        "google.drive.config",
        "get_google_drive_config",
        [props.resModel, activeId],
        { context }
    );
    return Boolean(items.length) && { activeId, context, items };
}

/**
 * Google drive menu
 *
 * This component is actually a set of list items used to enrich the ActionMenus's
 * "Action" dropdown list (@see ActionMenus). It will fetch
 * the current user's google drive configuration and set the result as its
 * items if any.
 * @extends DropdownMenuItem
 */
class GoogleDriveMenu extends owl.Component {

    setup() {
        this.orm = useService("orm");
    }

    //---------------------------------------------------------------------
    // Handlers
    //---------------------------------------------------------------------

    /**
     * @private
     * @param {number} itemId
     * @returns {Promise}
     */
    async _onGoogleDocItemClick(itemId) {
        const resID = this.props.activeId;
        const resModel = "google.drive.config";
        const domain = [['id', '=', itemId]];
        const fields = ['google_drive_resource_id', 'google_drive_client_id'];
        const configs = await this.orm.searchRead(resModel, domain, fields)
        const url = await this.orm.call(
            resModel,
            "get_google_drive_url",
            [itemId, resID, configs[0].google_drive_resource_id],
            { context: this.props.context }
        );
        if (url) {
            browser.open(url, '_blank');
        }
    }
}
GoogleDriveMenu.props = {
    activeId: Number,
    context: Object,
    items: {
        type: Array,
        element: Object,
    },
};
GoogleDriveMenu.template = 'GoogleDriveMenu';
GoogleDriveMenu.components = { DropdownItem };

export const googleDriveActionMenu = {
    Component: GoogleDriveMenu,
    getProps: googleDrivePropsGetter,
};

registry.category("action_menus").add('google-drive-menu', googleDriveActionMenu);
