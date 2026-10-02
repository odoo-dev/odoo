import { _t } from "@web/core/l10n/translation";
import { Interaction } from "@web/public/interaction";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

export class TeamBoard extends Interaction {
    static selector = "section.s_team_board";
    dynamicContent = {
        ".s_team_board_member": {
            "t-att-data-bs-toggle": () => "modal",
            "t-att-data-bs-target": () => ".o_team_board_modal",
            "t-att-role": () => "button",
        },
    };

    setup() {
        this.modal = this.el.querySelector(".o_team_board_modal");
        this.contactMethods = registry.category("website.s_team_board.button_methods");
    }

    start() {
        if (!this.modal) {
            return;
        }
        const placeholder = document.createComment("o_team_board_modal");
        this.modal.before(placeholder);
        document.body.appendChild(this.modal);

        this.modalInst = window.Modal.getOrCreateInstance(this.modal);

        this.addListener(this.modal, "show.bs.modal", (ev) =>
            this.updateModal(ev.relatedTarget)
        );

        for (const method of this.contactMethods.getAll()) {
            const btn = this.createButton(method.label, method.className ?? "");
            this.addListener(btn, "click", this.locked(() => this.runButtonMethod(method, btn), true));
        }
        this.registerCleanup(() => {
            this.modalInst.dispose();
            placeholder.replaceWith(this.modal);
        });
    }

    updateModal(member) {
        const member_fields = { name: ".card-title", role: ".text-muted", bio: ".card-text" };

        const img = member.querySelector("img");
        const modalImg = this.modal.querySelector(".o_team_board_modal_img");
        modalImg.src = img.src;
        modalImg.alt = img.alt;
        for (const [field, selector] of Object.entries(member_fields)) {
            this.modal.querySelector(`.o_team_board_modal_${field}`).textContent =
                member.querySelector(selector).textContent;
        }
        this.currentMemberName = member.querySelector(".card-title").textContent;
    }

    createButton(label, className) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn btn-primary ${className}`;
        btn.textContent = label;
        this.modal.querySelector(".o_team_board_modal_buttons").append(btn);
        this.registerCleanup(() => btn.remove());

        return btn;
    }

    async runButtonMethod(method, btn) {
        const label = btn.textContent;
        btn.textContent = method.loadingLabel ?? label;
        try {
            await this.waitFor(
                method.onClick({
                    memberName: this.modal.querySelector(".o_team_board_modal_name").textContent,
                })
            );
            if (method.closeOnSuccess !== false) {
                this.modalInst.hide();
            }
            this.services.notification.add(method.successMessage, { type: "success" });
        } catch {
            this.services.notification.add(method.errorMessage, { type: "danger" });
        } finally {
            btn.textContent = label;
        }
    }
}

registry.category("website.s_team_board.button_methods").add(
    "send_message",
    {
        label: _t("Send a message"),
        loadingLabel: _t("Sending..."),
        successMessage: _t("Your message has been sent."),
        errorMessage: _t("Your message could not be sent."),
        async onClick({ memberName }) {
            const result = await rpc("/website/contact", { member_name: memberName });
            if (!result.success) {
                throw new Error(result.error);
            }
        },
    },
    { sequence: 10 }
);

registry.category("public.interactions").add("website.team_board", TeamBoard);
