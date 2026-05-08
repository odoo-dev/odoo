// Part of Odoo. See LICENSE file for full copyright and licensing details.
import { registry } from "@web/core/registry";

/**
 * Provides the list of whitelisted Material Symbols icon names.
 *
 * The wishlist is read from the static JSON file bundled with the web_icons
 * module, so no RPC or authentication is required.  This makes the service
 * usable in both the backend and the frontend (public) environments.
 */
export const iconService = {
    async start() {
        let wishlist;
        let withFill;
        return {
            /**
             * @returns {Promise<string[]>} the icon-name wishlist, fetched and
             * cached on first call.
             */
            async getWishlist() {
                if (!wishlist) {
                    const response = await fetch(
                        "/web_icons/static/src/data/icons.json"
                    );
                    if (!response.ok) {
                        console.warn(  // noqa: T201
                            `[web_icons] Could not load icons wishlist (HTTP ${response.status}). ` +
                            "All Material Symbols icons will be shown."
                        );
                        return [];
                    }
                    const data = await response.json();
                    wishlist = Object.keys(data);
                    withFill = new Set(wishlist.filter((icon) => data[icon].has_fill));
                }
                return wishlist;
            },
            /**
             * @returns {Promise<Set<string>>} the set of icon names that have
             * a fill variant.
             */
            async getIconsWithFill() {
                if (!wishlist) {
                    await this.getWishlist();
                }
                return withFill;
            }
        };
    },
};

registry.category("services").add("iconService", iconService);

