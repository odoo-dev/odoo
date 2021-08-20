/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, many2many } from '@mail/model/model_field';

function factory(dependencies) {

    class MailTemplate extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @param {mail.activity} activity
         */
        preview(activity) {
            const action = {
                name: this.env._t("Compose Email"),
                type: 'ir.actions.act_window',
                res_model: 'mail.compose.message',
                views: [[false, 'form']],
                target: 'new',
                context: {
                    default_res_id: activity.thread.id,
                    default_model: activity.thread.model,
                    default_use_template: true,
                    default_template_id: this.id,
                    force_email: true,
                },
            };
            owl.Component.env.bus.trigger('do-action', {
                action,
                options: {
                    on_close: () => {
                        activity.thread.refresh();
                    },
                },
            });
        }

        /**
         * @param {mail.activity} activity
         */
        async send(activity) {
            const thread = activity.thread;
            await this.env.services.orm.call(activity.thread.model, 'activity_send_mail', [[activity.thread.id]], {
                template_id: this.id,
            });
            if (thread.exists()) {
                thread.refresh();
            }
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        static _createRecordLocalId(data) {
            return `${this.modelName}_${data.id}`;
        }

    }

    MailTemplate.fields = {
        activities: many2many('mail.activity', {
            inverse: 'mailTemplates',
        }),
        id: attr({
            required: true,
        }),
        name: attr(),
    };

    MailTemplate.modelName = 'mail.mail_template';

    return MailTemplate;
}

registerNewModel('mail.mail_template', factory);
