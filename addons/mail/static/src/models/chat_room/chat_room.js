odoo.define('mail/static/src/models/chat_room/chat_room.js', function (require) {
'use strict';

const { registerNewModel } = require('mail/static/src/model/model_core.js');
const { attr, many2one } = require('mail/static/src/model/model_field.js');

function factory(dependencies) {

    class ChatRoom extends dependencies['mail.model'] {


        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        static async fetchRooms() {
            const roomData = await this.env.services.rpc({
                model: 'mail.room',
                method: 'search_read',
                fields: ['id', 'name', 'room_token'],
                args: [[]],
            }, { shadow: true });
            if (!roomData || roomData.length === 0) {
                return;
            }
            const roomIds = [];
            this.insert(roomData.map((roomData) => {
                 roomIds.push(roomData.id);
                 return this.convertData(roomData);
            }));
            // deletes rooms that no longer exist
            for (const room of this.all()) {
                if (roomIds.includes(room.id)) {
                    continue;
                }
                room.delete();
            }
        }

        async joinRoom() {
            const { peerToken, peerTokens } = await this.env.services.rpc({
                model: 'mail.room',
                method: 'join_room',
                args: [[this.id]],
            });
            this.updateTokens(peerTokens);
            return peerToken;
        }

        async leaveRoom() {
            return await this.env.services.rpc({
                model: 'mail.room',
                method: 'leave_room',
                args: [[this.id]],
            });
        }

        /**
         * @static
         * @private
         * @param {Object} data
         * @return {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('room_token' in data) {
                data2.roomToken = data.room_token;
            }
            if ('name' in data) {
                data2.name = data.name;
            }
            if ('peer_tokens' in data) {
                data2.peerTokens = data.peer_tokens;
            }
            // relation
            /*
            if ('partner_ids' in data) {
                data2.partnerIds = [['insert', data.partner_ids]];
            }
            */
            return data2;
        }

        updateTokens(peerTokens) {
            this.update({ peerTokens });
        }

        removeUser(peerToken) {
            const peerTokens = new Set(this.peerTokens);
            peerTokens.delete(peerToken);
            this.update({ peerTokens: [...peerTokens] });
        }
    }

    ChatRoom.fields = {
        id: attr({
            required: true,
        }),
        roomToken: attr(),
        name: attr(),
        /*
        partnerIds: many2one('mail.partner', {
            inverse: 'room',
        }),
        */
        peerTokens: attr(),
    };

    ChatRoom.modelName = 'mail.chat_room';

    return ChatRoom;
}

registerNewModel('mail.chat_room', factory);

});
