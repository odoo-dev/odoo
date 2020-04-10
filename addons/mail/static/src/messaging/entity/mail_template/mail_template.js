odoo.define('mail.messaging.entity.MailTemplate', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many } = require('mail.messaging.EntityField');

function MailTemplateFactory({ Entity }) {

    class MailTemplate extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @param {mail.messaging.entity.Activity} activity
         */
        preview(activity) {
            const action = {
                name: this.env._t("Compose Email"),
                type: 'ir.actions.act_window',
                res_model: 'mail.compose.message',
                views: [[false, 'form']],
                target: 'new',
                context: {
                    default_res_id: activity.res_id,
                    default_model: activity.res_model,
                    default_use_template: true,
                    default_template_id: this.id,
                    force_email: true,
                },
            };
            this.env.do_action(action, {
                on_close: () => {
                    if (activity.chatter) {
                        activity.chatter.refresh();
                    }
                }
            });
        }

        /**
         * @param {mail.messaging.entity.Activity} activity
         */
        async send(activity) {
            await this.async(() => this.env.rpc({
                model: activity.res_model,
                method: 'activity_send_mail',
                args: [[activity.res_id], this.id],
            }));
            if (activity.chatter) {
                activity.chatter.refresh();
            }
        }

    }

    MailTemplate.entityName = 'MailTemplate';

    MailTemplate.fields = {
        activities: many2many('Activity', {
            inverse: 'mailTemplates',
        }),
        id: attr(),
        name: attr(),
    };

    return MailTemplate;
}

registerNewEntity('MailTemplate', MailTemplateFactory);

});
