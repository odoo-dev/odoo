/** @odoo-module alias=mail.utils.timeFromNow **/

import { _t } from 'web.core';

export default function timeFromNow(date) {
    if (moment().diff(date, 'seconds') < 45) {
        return _t("now");
    }
    return date.fromNow();
}
