/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import SurveyFormWidget from "@survey/js/survey_form";

SurveyFormWidget.include({
    events: Object.assign({}, SurveyFormWidget.prototype.events, {
        'click button[id="save_progress"]': '_saveProgress',
    }),
    init: function () {
        this._super(...arguments);
        this.notification = this.bindService("notification");
    },
    _saveProgress: async function (event) {
        event.preventDefault();
        var params = {};
        var $form = this.$('form');
        var formData = new FormData($form[0]);
        this._prepareSubmitValues(formData, params);
        this.notification.add(_t("Response saved succesfully"), {
            type: "success",
        });
        await rpc(
            `/survey/save/${this.options.surveyToken}/${this.options.answerToken}`,
            params
        );
    }
})
