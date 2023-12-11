/* @odoo-module */

import { patch } from "@web/core/utils/patch";
import { MockServer } from "@web/../tests/helpers/mock_server";

patch(MockServer.prototype, {
    _mockMailGuest__getGuestFromContext() {
        const guestId = this.pyEnv?.cookie.get("dgid");
        return guestId ? this.pyEnv["mail.guest"].searchRead([["id", "=", guestId]])[0] : null;
    },
    _mockMailGuest__initMessaging() {
        const guest = this._mockMailGuest__getGuestFromContext();
        const channelIds = this.pyEnv["discuss.channel.member"]
            .searchRead([["guest_id", "=", guest.id]])
            .map((member) =>
                Array.isArray(member.channel_id) ? member.channel_id[0] : member.channel_id
            );
        return {
            Thread: this._mockDiscussChannelChannelInfo(channelIds),
            self: { id: guest.id, name: guest.name, type: "guest" },
            current_user_id: false,
            settings: {},
            hasGifPickerFeature: true,
            hasLinkPreviewFeature: true,
            initBusId: this.lastBusNotificationId,
            menu_id: false,
            odoobot: this._mockResPartnerMailPartnerFormat(this.odoobotId).get(this.odoobotId),
        };
    },
    /**
     * Simulates `_guest_format` on `mail_guest`.
     *
     * @private
     * @returns {Number[]} ids
     * @returns {Map}
     */
    _mockMailGuestGuestFormat(ids) {
        const guests = this.getRecords("mail.guest", [["id", "in", ids]], {
            active_test: false,
        });
        return new Map(
            guests.map((guest) => {
                return [
                    guest.id,
                    {
                        id: guest.id,
                        im_status: guest.im_status,
                        name: guest.name,
                        type: "guest",
                        write_date: guest.write_date,
                    },
                ];
            })
        );
    },
});
