/** @odoo-module **/

import publicWidget from '@web/legacy/js/public/public_widget';

publicWidget.registry.marquee = publicWidget.Widget.extend({
    selector: '.s_marquee_text',

    start() {
        return this._super(...arguments);
    },
});

export default publicWidget.registry.marquee
