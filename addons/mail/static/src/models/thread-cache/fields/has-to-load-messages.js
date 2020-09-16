/** @odoo-module alias=mail.models.ThreadCache.fields.hasToLoadMessages **/

import attr from 'mail.model.field.attr.define';

/**
 * Determines whether `this` should load initial messages. This field is
 * computed and should be considered read-only.
 * @see `isCacheRefreshRequested` to request manual refresh of messages.
 */
export default attr({
    name: 'hasToLoadMessages',
    id: 'mail.models.ThreadCache.fields.hasToLoadMessages',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadCache} param0.record
     * @returns {boolean}
     */
    compute({ ctx, env, record }) {
        if (!record.thread(ctx)) {
            // happens during destroy or compute executed in wrong order
            return false;
        }
        if (record.hasLoadingFailed(ctx)) {
            return false;
        }
        const wasCacheRefreshRequested = record.isCacheRefreshRequested(ctx);
        // mark hint as processed
        env.services.action.dispatch(
            'Record/update',
            record,
            { isCacheRefreshRequested: false },
        );
        if (record.thread(ctx).isTemporary(ctx)) {
            // temporary threads don't exist on the server
            return false;
        }
        if (!wasCacheRefreshRequested && record.threadViews(ctx).length === 0) {
            // don't load message that won't be used
            return false;
        }
        if (record.isLoading(ctx)) {
            // avoid duplicate RPC
            return false;
        }
        if (
            !wasCacheRefreshRequested &&
            record.isLoaded(ctx)
        ) {
            // avoid duplicate RPC
            return false;
        }
        const isMainCache = record.thread(ctx).mainCache(ctx) === record;
        if (
            isMainCache &&
            record.isLoaded(ctx)
        ) {
            // Ignore request on the main cache if it is already loaded or
            // loading. Indeed the main cache is automatically sync with
            // server updates already, so there is never a need to refresh
            // it past the first time.
            return false;
        }
        return true;
    },
});
