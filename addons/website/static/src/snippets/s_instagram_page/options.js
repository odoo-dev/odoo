/** @odoo-module **/

import options from "@web_editor/js/editor/snippets.options";
import SocialMediaOption from "@website/snippets/s_social_media/options";

options.registry.InstagramPage = options.Class.extend({
    /**
     * @override
     */
    async onBuilt() {
        const pageName = await this._getDbInstagramPageName();
        if (pageName) {
            this.$target[0].dataset.instagramPage = pageName;
        }
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * Returns the instagram page name from the DB (or the cache).
     *
     * @private
     * @returns {string|undefined}
     */
    async _getDbInstagramPageName() {
        const igPageInDb = await this._getDbSocialInstagram();
        const preNameString = "instagram.com/";
        const defaultIg = "https://www.instagram.com/explore/tags/odoo/";
        if (!igPageInDb || igPageInDb === defaultIg || !defaultIg.includes(preNameString)) {
            return;
        }
        const pageName = igPageInDb.split(preNameString)[1];
        if (!pageName || pageName.includes("?") || pageName.includes("#")) {
            return;
        }
        if (pageName.includes("/") && pageName.split("/")[1].length > 0) {
            return;
        }
        return pageName.split("/")[0];
    },
    /**
     * Returns the value of social_instagram from the DB (or the cache).
     *
     * @private
     * @returns {string|undefined}
     */
    async _getDbSocialInstagram() {
        // First we check if the user has changed his instagram during the
        // current edition (via the social media options).
        const dbSocialValuesCache = SocialMediaOption.getDbSocialValuesCache();
        if (dbSocialValuesCache && dbSocialValuesCache["social_instagram"]) {
            return dbSocialValuesCache["social_instagram"];
        }
        // If not, we check the value in the DB.
        let websiteId;
        this.trigger_up("context_get", {
            callback: function (ctx) {
                websiteId = ctx["website_id"];
            },
        });
        const values = await this._rpc({
            model: "website",
            method: "read",
            args: [websiteId, ["social_instagram"]],
        });
        return values[0]["social_instagram"];
    },
});

export default {
    InstagramPage: options.registry.InstagramPage,
};
