/** @odoo-module alias=mail.models.Device.actions.start **/

import action from 'mail.action.define';

/**
 * Called when messaging is started.
 */
export default action({
    name: 'Device/start',
    id: 'mail.models.Device.actions.start',
    global: true,
    /**
     * @param {Object} param0
     * @param {web.env} param0.env
     * @param {Device} device
     */
    func(
        { env },
        device,
    ) {
        const _onResize = _.debounce(
            () => env.services.action.dispatch(
                'Device/_refresh',
                device,
            ),
            100
        );
        Object.assign(device, { _onResize });
        // TODO FIXME Not using this.env.browser because it's proxified, and
        // addEventListener does not work on proxified window. task-2234596
        window.addEventListener('resize', device._onResize);
        env.services.action.dispatch(
            'Device/_refresh',
            device,
        );
    },
});
