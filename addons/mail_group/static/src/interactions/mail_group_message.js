


import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

class MailGroupMessage extends Interaction {
    static selector = ".o_mg_message";
    dynamicContent = {
        ".o_mg_link_hide": { "t-on-click.prevent.stop": this.onClickLinkHide },
        ".o_mg_link_show": { "t-on-click.prevent.stop": this.onClickLinkShow },
        "button.o_mg_read_more": { "t-on-click": this.onClickReadMore },
    }

    setup() {
        // By default hide the mention of the previous email for which we reply
        // And add a button "Read more" to show the mention of the parent email
        const body = this.el.querySelector(".card-body");
        const quoted = document.body.querySelector('*[data-o-mail-quote]');
        const readMore = document.createElement("button");
        readMore.classList.add("btn btn-light btn-sm ms-1");
        readMore.innerText = ". . .";
        quoted.insertBefore(readMore);
        readMore.addEventListener("click", () => quoted.classList.toggle("visible"));
    }

    onClickLinkHide() {
        const container = ev.currentTarget.closest(".o_mg_link_parent");
        container.querySelector('.o_mg_link_hide').classList.add('d-none');
        container.querySelector('.o_mg_link_show').classList.remove('d-none');
        container.querySelector('.o_mg_link_content').classList.remove('d-none');
    }

    onClickLinkShow() {
        const container = ev.currentTarget.closest(".o_mg_link_parent");
        container.find('.o_mg_link_hide').first().classList.remove('d-none');
        container.find('.o_mg_link_show').first().classList.add('d-none');
        container.find('.o_mg_link_content').first().classList.add('d-none');
    }

    onClickReadMore() {
        rpc(ev.target.getAttribute('href'), {
            last_displayed_id: ev.target.dataste.listDisplayedId,
        }).then(function (data) {
            if (!data) {
                return;
            }
            const threadContainer = ev.target.closest(".o_mg_replies")?.querySelector("ul.list-unstyled");
            if (threadContainer) {
                let lastMsg = threadContainer.querySelectorAll("li.media").last;
                const newMessages = data.querySelector("ul.list-unstyled").querySelectorAll(":scope > li.media");
                for (const newMessage in newMessages) {
                    lastMsg.insertAdjacentElement(newMessage, "afterend");
                    lastMsg = newMessage;
                }
                threadContainer.appendChild(data.querySelector('.o_mg_read_more').parentElement)
            }
            target.parentElement.remove();
        });
    }
}

registry
    .category("public.interactions")
    .add("mail_group.mail_group_message", MailGroupMessage);
