import { getLazySessionValue } from "@web/core/user";
import { patch } from "@web/core/utils/patch";
import { assets, AssetsLoadingError } from "@web/core/assets";
import { session } from "@web/session";

const { _getBundleRPC } = assets;
patch(assets, {
    /**
     *
     * @param {string} bundleName Name of the bundle containing the list of files
     * @param {Map<string, Promise<BundleFileNames | void>>} cacheMap
     * @return {Promise<unknown>}
     * @private
     */
    _getBundleRPC(bundleName, cacheMap) {
        const lazyBundlesName = session.lazy_bundles_name || [];
        if (!lazyBundlesName.includes(bundleName)) {
            return _getBundleRPC(bundleName, cacheMap);
        }
        return new Promise((resolve, reject) => {
            getLazySessionValue("bundles", (bundles) => {
                if (bundles[bundleName]) {
                    return resolve(assets._processBundle(bundles[bundleName]));
                }
                reject(
                    new AssetsLoadingError(`Missing bundle ${bundleName} in lazy_session_info !`)
                );
            });
        });
    },
});
