import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

registry.category("web_tour.tours").add("mail_poll_end_tour.js", {
    steps: () => {
        const pollId = new URL(window.location.href).searchParams.get("poll_id");
        return [
            {
                trigger: ".o-mail-DiscussContent-threadName[title='General']",
                run: () => rpc("/mail/poll/end", { poll_id: pollId }),
            },
            {
                trigger:
                    '.o-mail-PollResult:contains(internal (base.group_user)\'s poll "Test poll end" has closed)',
            },
        ];
    },
});
