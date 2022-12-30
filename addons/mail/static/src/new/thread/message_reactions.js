/** @odoo-module */

import { Component, useState } from "@odoo/owl";

import { useService } from "@web/core/utils/hooks";
import { sprintf } from "@web/core/utils/strings";
import { _t } from "@web/core/l10n/translation";

export class MessageReactions extends Component {
    static props = ["message"];
    static template = "mail.message_reactions";

    setup() {
        this.user = useService("user");
        this.messaging = useService("mail.messaging");
        this.messageService = useState(useService("mail.message"));
    }

    getReactionSummary(reaction) {
        const [firstUserName, secondUserName, thirdUserName] = reaction.partners.map(
            ({ name, displayName }) => name || displayName
        );
        switch (reaction.count) {
            case 1:
                return sprintf(_t("%s has reacted with %s"), firstUserName, reaction.content);
            case 2:
                return sprintf(
                    _t("%s and %s have reacted with %s"),
                    firstUserName,
                    secondUserName,
                    reaction.content
                );
            case 3:
                return sprintf(
                    _t("%s, %s, %s have reacted with %s"),
                    firstUserName,
                    secondUserName,
                    thirdUserName,
                    reaction.content
                );
            case 4:
                return sprintf(
                    _t("%s, %s, %s and 1 other person have reacted with %s"),
                    firstUserName,
                    secondUserName,
                    thirdUserName,
                    reaction.content
                );
            default:
                return sprintf(
                    _t("%s, %s, %s and %s other persons have reacted with %s"),
                    firstUserName,
                    secondUserName,
                    thirdUserName,
                    reaction.partners.length - 3,
                    reaction.content
                );
        }
    }

    hasUserReacted(reaction) {
        return reaction.partners.some(({ id }) => id === this.user.partnerId);
    }

    onClickReaction(reaction) {
        if (this.hasUserReacted(reaction)) {
            this.messageService.removeReaction(reaction);
        } else {
            this.messageService.react(this.props.message, reaction.content);
        }
    }
}
