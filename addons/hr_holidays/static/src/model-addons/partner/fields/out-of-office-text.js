/** @odoo-module alias=hr_holidays.modelAddons.Partner.fields.outOfOfficeText **/

import attr from 'mail.model.field.attr.define';

import { str_to_datetime } from 'web.time';

/**
 * Text shown when partner is out of office.
 */
export default attr({
    name: 'outOfOfficeText',
    id: 'hr_holidays.modelAddons.Partner.fields.outOfOfficeText',
    global: true,
    /**
     * @param {Object} param0
     * @param {string} param0.ctx
     * @param {web.env} param0.env
     * @param {Partner} param0.record
     * @returns {string}
     */
    compute({ ctx, env, record }) {
        if (!record.outOfOfficeDateEnd(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        if (!env.services.model.messaging.locale(ctx).language(ctx)) {
            return env.services.action.dispatch(
                'RecordFieldCommand/clear',
            );
        }
        const currentDate = new Date();
        const date = str_to_datetime(record.outOfOfficeDateEnd(ctx));
        const options = { day: 'numeric', month: 'short' };
        if (currentDate.getFullYear() !== date.getFullYear()) {
            options.year = 'numeric';
        }
        const localeCode = env.services.model.messaging.locale(ctx).language(ctx).replace(/_/g, '-');
        const formattedDate = date.toLocaleDateString(localeCode, options);
        return _.str.sprintf(
            env._t("Out of office until %s"),
            formattedDate,
        );
    },
});
