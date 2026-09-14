import { mailModels } from "@mail/../tests/mail_test_helpers";
import { fields } from "@web/../tests/web_test_helpers";

export class ResPartner extends mailModels.ResPartner {
    is_in_calendar_meeting = fields.Boolean();

    _store_im_status_fields(res) {
        super._store_im_status_fields(res);
        res.attr("is_in_calendar_meeting", undefined, { sudo: true });
    }
}
