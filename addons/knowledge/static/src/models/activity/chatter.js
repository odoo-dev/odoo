/** @odoo-module **/

import { addRecordMethods } from '@mail/model/model_core';
var core = require('web.core');

// ensure that the model definition is loaded before the patch
import '@mail/models/chatter/chatter';

addRecordMethods('Chatter', {
    onClickChatterSearchArticle(event) {
        core.bus.trigger("openMainPalette", {
            searchValue: "?",
        });
    },
});
