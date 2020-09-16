/** @odoo-module alias=mail.models.Device.actions._refresh **/

import action from 'mail.action.define';

export default action({
    name: 'Device/_refresh',
    id: 'mail.models.Device.actions._refresh',
    global: true,
    /**
     * @private
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Device} device
     */
    func(
        { env },
        device,
    ) {
        env.services.action.dispatch(
            'Record/update',
            device,
            {
                globalWindowInnerHeight: env.browser.innerHeight,
                globalWindowInnerWidth: env.browser.innerWidth,
                isMobile: env.device.isMobile,
            },
        );
    },
});
