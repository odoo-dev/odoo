/** @odoo-module **/

const { tags, hooks, misc } = owl;
const { useComponent, onMounted, onWillUnmount, useRef, useSubEnv } = hooks;
import { useActiveElement } from "../ui_service";
import { useHotkey } from "../hotkey_hook";
const { Portal } = misc;

export function useModal(params) {
    const component = useComponent();
    const defaultParams = {
        fullscreen: false,
        renderFooter: true,
        renderHeader: true,
        size: "modal-lg",
        technical: true,
        title: "Odoo",
        buttons: [
            {
                name: "Ok",
                primary: true,
                onClick: close,
            },
        ],
    };
    component.modalParams = Object.assign({}, defaultParams, params);

    //Component template
    const templateName = component.constructor.template;
    const templateCore = component.env.qweb.templates[templateName];

    //Modal template
    const templateModal = component.env.qweb.templates["web.Modal"];
    const templateString = templateModal.elem.firstElementChild.outerHTML;

    //New mixed template
    const parser = new DOMParser();
    const dom = parser.parseFromString(templateString, "application/xml");
    dom.querySelector(".modal-body").innerHTML = templateCore.elem.outerHTML;
    const template = tags.xml`${dom.firstChild.outerHTML}`;
    // render the new template;
    component.__owl__.renderFn = component.env.qweb.render.bind(component.env.qweb, template);

    component.constructor.components = { Portal };

    //Use hotkey
    const modalRef = useRef("modal");
    useActiveElement("modal");
    useHotkey(
        "escape",
        () => {
            if (!modalRef.el.classList.contains("o_inactive_modal")) {
                close();
            }
        },
        { altIsOptional: true }
    );
    useSubEnv({ inDialog: true });

    function close() {
        component.trigger("dialog-closed");
    }

    onMounted(() => {
        const dialogContainer = document.querySelector(".o_dialog_container");
        const modals = dialogContainer.querySelectorAll(".o_dialog .modal");
        const len = modals.length;
        for (let i = 0; i < len - 1; i++) {
            const modal = modals[i];
            modal.classList.add("o_inactive_modal");
        }
        dialogContainer.classList.add("modal-open");
    });

    onWillUnmount(() => {
        const dialogContainer = document.querySelector(".o_dialog_container");
        const modals = dialogContainer.querySelectorAll(".o_dialog .modal");
        const len = modals.length;
        if (len >= 2) {
            const modal = modalRef.el === modals[len - 1] ? modals[len - 2] : modals[len - 1];
            modal.focus();
            modal.classList.remove("o_inactive_modal");
        } else {
            dialogContainer.classList.remove("modal-open");
        }
    });
}
