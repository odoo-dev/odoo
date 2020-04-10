odoo.define('mail.messaging.entity.User', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, one2one } = require('mail.messaging.EntityField');

function UserFactory({ Entity }) {

    class User extends Entity {

        /**
         * @override
         */
        delete() {
            if (this.env.messaging) {
                if (this === this.env.messaging.currentUser) {
                    this.env.messaging.update({ currentUser: [['unlink-all']] });
                }
            }
            super.delete();
        }

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @returns {string}
         */
        nameOrDisplayName() {
            const partner = this.partner;
            if (!partner) {
                return this.partnerDisplayName;
            }
            return partner.nameOrDisplayName;
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        _createInstanceLocalId(data) {
            return `${this.constructor.entityName}_${data.id}`;
        }

        /**
         * @override
         */
        _updateAfter(previous) {
            if (this.partnerDisplayName && this.partner) {
                this.partner.update({ display_name: this.partnerDisplayName });
            }
        }

    }

    User.entityName = 'User';

    User.fields = {
        id: attr(),
        model: attr({
            default: 'res.user',
        }),
        partner: one2one('Partner', {
            inverse: 'user',
        }),
        partnerDisplayName: attr(),
    };

    return User;
}

registerNewEntity('User', UserFactory);

});
