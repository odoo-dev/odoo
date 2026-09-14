import { imStatusDataRegistry } from "@mail/core/common/im_status";
import { _t } from "@web/core/l10n/translation";

imStatusDataRegistry.add(
    "discuss-call",
    {
        condition: ({ user }) => Boolean(user?.partner_id?.is_in_call),
        icon: "videocam",
        iconClass: "oi-filled",
        title: {
            online: _t("User is in a Discuss meeting and online"),
            away: _t("User is in a Discuss meeting and idle"),
            busy: _t("User is in a Discuss meeting and busy"),
            default: _t("User is in a Discuss meeting"),
        },
    },
    { sequence: 30 }
);
