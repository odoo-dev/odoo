import { getLazySessionValue } from "@web/webclient/webclient";
import { patch } from "@web/core/utils/patch";
import { assets } from "@web/core/assets";

patch(assets, {
    /**
     *
     * @param {string} bundleName Name of the bundle containing the list of files
     * @param {Map<string, Promise<BundleFileNames | void>>} cacheMap
     * @return {Promise<unknown>}
     * @private
     */
    _getBundleRPC(bundleName, cacheMap) {
        const self = super._getBundleRPC;
        return new Promise((resolve, reject) => {
            getLazySessionValue("bundles", (bundles) => {
                if (bundles[bundleName]) {
                    return resolve(this._processBundle(bundles[bundleName]));
                }
                self(bundleName, cacheMap).then(resolve, reject);
            });
        });
    },
});
