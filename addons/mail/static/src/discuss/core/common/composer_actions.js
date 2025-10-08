import { registerComposerAction } from "@mail/core/common/composer_actions";
import { CreatePollDialog } from "@mail/discuss/core/common/create_poll_dialog";

import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";

registerComposerAction("start-poll", {
    name: _t("Start a poll"),
    icon: "oi oi-view-cohort",
    condition: ({ composer, store }) =>
        store.self_partner && ["channel", "group"].includes(composer.targetThread?.channel_type),
    onSelected: ({ composer, owner }) =>
        owner.dialogService.add(CreatePollDialog, { thread: composer.targetThread }),
    setup: ({ owner }) => {
        owner.dialogService = useService("dialog");
    },
});
