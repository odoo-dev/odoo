/** @odoo-module alias=mail.utils.test.beforeEach **/

import MockModels from 'mail.tests.MockModels';

export default function beforeEach(self) {
    const data = MockModels.generateData();

    data.partnerRootId = 2;
    data['res.partner'].records.push({
        active: false,
        display_name: "OdooBot",
        id: data.partnerRootId,
    });

    data.currentPartnerId = 3;
    data['res.partner'].records.push({
        display_name: "Your Company, Mitchell Admin",
        id: data.currentPartnerId,
        name: "Mitchell Admin",
    });
    data.currentUserId = 2;
    data['res.users'].records.push({
        display_name: "Your Company, Mitchell Admin",
        id: data.currentUserId,
        name: "Mitchell Admin",
        partner_id: data.currentPartnerId,
    });

    data.publicPartnerId = 4;
    data['res.partner'].records.push({
        active: false,
        display_name: "Public user",
        id: data.publicPartnerId,
    });
    data.publicUserId = 3;
    data['res.users'].records.push({
        active: false,
        display_name: "Public user",
        id: data.publicUserId,
        name: "Public user",
        partner_id: data.publicPartnerId,
    });

    const originals = {
        '_.debounce': _.debounce,
        '_.throttle': _.throttle,
    };

    (function doPatch() {
        // patch _.debounce and _.throttle to be fast and synchronous
        _.debounce = _.identity;
        _.throttle = _.identity;
    })();

    function doUnpatch() {
        _.debounce = originals['_.debounce'];
        _.throttle = originals['_.throttle'];
    }

    Object.assign(self, {
        components: [],
        data,
        doUnpatch,
        widget: undefined
    });
}
