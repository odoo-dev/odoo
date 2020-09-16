/** @odoo-module alias=mail.models.ThreadView.fields.onThreadCacheIsLoadingChanged **/

import attr from 'mail.model.field.attr.define';

/**
 * Not a real field, used to trigger `_onThreadCacheIsLoadingChanged`
 * when one of the dependencies changes.
 *
 * @see `isLoading`
 */
export default attr({
    name: 'onThreadCacheIsLoadingChanged',
    id: 'mail.models.ThreadView.fields.onThreadCacheIsLoadingChanged',
    global: true,
    dependencies: [
        'threadCache',
        'threadCacheIsLoading',
    ],
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {ThreadView} param0.record
     */
    compute({ ctx, env, record }) {
        if (record.threadCache(ctx)?.isLoading(ctx)) {
            if (
                !record.isLoading(ctx) &&
                !record.isPreparingLoading(ctx)
            ) {
                env.services.action.dispatch(
                    'Record/update',
                    record,
                    { isPreparingLoading: true },
                );
                env.services.action.dispatch(
                    'Record/doAsync',
                    record,
                    () => new Promise(
                        resolve => {
                            record._loaderTimeout = env.browser.setTimeout(resolve, 400);
                        },
                    ),
                )
                .then(
                    () => {
                        const isLoading = (
                            record.threadCache(ctx)?.isLoading(ctx) ??
                            false
                        );
                        env.services.action.dispatch(
                            'Record/update',
                            record,
                            {
                                isLoading,
                                isPreparingLoading: false,
                            },
                        );
                    },
                );
            }
            return;
        }
        env.browser.clearTimeout(record._loaderTimeout);
        env.services.action.dispatch(
            'Record/update',
            record,
            {
                isLoading: false,
                isPreparingLoading: false,
            },
        );
    },
});
