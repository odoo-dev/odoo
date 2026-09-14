import { imStatusDataRegistry } from "@mail/core/common/im_status";
import { _t } from "@web/core/l10n/translation";

imStatusDataRegistry.add(
    "calendar-meeting",
    {
        condition: ({ user }) => Boolean(user?.partner_id?.is_in_calendar_meeting),
        icon: "calendar_month",
        iconClass: "oi-filled",
        title: {
            online: _t("User is in a meeting and online"),
            away: _t("User is in a meeting and idle"),
            busy: _t("User is in a meeting and busy"),
            default: _t("User is in a meeting"),
        },
    },
    { sequence: 40 }
);
