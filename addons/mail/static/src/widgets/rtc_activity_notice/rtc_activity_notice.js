/** @odoo-module **/

import RtcActivityNoticeComponent from '@mail/components/rtc_activity_notice/rtc_activity_notice';

import SystrayMenu from 'web.SystrayMenu';
import Widget from 'web.Widget';

/**
 * Odoo Widget, necessary to instantiate component.
 */
const RtcActivityNotice = Widget.extend({
    template: 'mail.widgets.RtcActivityNotice',
    sequence: 99, // position in the systray, right to left.
    /**
     * @override
     */
    init() {
        this._super(...arguments);
        this.component = undefined;
    },
    /**
     * @override
     */
    destroy() {
        if (this.component) {
            this.component.destroy();
        }
        this._super(...arguments);
    },
    async on_attach_callback() {
        this.component = new RtcActivityNoticeComponent(null);
        await this.component.mount(this.el);
        // unwrap
        this.el.parentNode.insertBefore(this.component.el, this.el);
        this.el.parentNode.removeChild(this.el);
    },
});

SystrayMenu.Items.push(RtcActivityNotice);

export default RtcActivityNotice;
