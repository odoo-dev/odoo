odoo.define('mail.messaging.entity.DialogManager', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, one2many } = require('mail.messaging.EntityField');

function DialogManagerFactory({ Entity }) {

    class DialogManager extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @param {mail.messaging.entity.Dialog} dialog
         */
        close(dialog) {
            this.unregister(dialog);
            dialog.delete();
        }

        /**
         * @param {string} entityName
         * @param {Object} [entityData]
         */
        open(entityName, entityData) {
            const dialog = this.env.entities.Dialog.create({
                manager: [['link', this]],
            });
            if (!entityName) {
                throw new Error("Dialog should have a link to entity");
            }
            const Entity = this.env.entities[entityName];
            if (!Entity) {
                throw new Error(`No entity exists with name ${entityName}`);
            }
            const entity = Entity.create(entityData);
            dialog.update({ entity: [['link', entity]] });
            this.update({ _ordered: this._ordered.concat([dialog.localId]) });
            return dialog;
        }

        /**
         * @param {mail.messaging.entity.Dialog} dialog
         */
        unregister(dialog) {
            if (!this.allOrdered.includes(dialog)) {
                return;
            }
            this.update({
                _ordered: this._ordered.filter(
                    _dialog => _dialog !== dialog.localId
                ),
                dialogs: [['unlink', dialog]],
            });
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * FIXME: dependent on implementation that uses arbitrary order in relations!!
         *
         * @private
         * @returns {mail.messaging.entity.Dialog}
         */
        _computeAllOrdered() {
            return [['replace', this._ordered.map(_dialog => this.env.entities.Dialog.get(_dialog))]];
        }
    }

    DialogManager.entityName = 'DialogManager';

    DialogManager.fields = {
        _ordered: attr({ default: [] }),
        // FIXME: dependent on implementation that uses arbitrary order in relations!!
        allOrdered: one2many('Dialog', {
            compute: '_computeAllOrdered',
            dependencies: [
                '_ordered',
                'dialogs',
            ],
        }),
        dialogs: one2many('Dialog', {
            inverse: 'manager',
            isCausal: true,
        }),
    };

    return DialogManager;
}

registerNewEntity('DialogManager', DialogManagerFactory);

});
