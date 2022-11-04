/** @odoo-module */

import { useBus, useService } from '@web/core/utils/hooks';

const { useComponent, useRef, useEffect, useState } = owl;

export function useExpenseDocumentDropZone() {
    const component = useComponent();

    const dragState = useState({
        showDragZone: false,
    });

    function highlight(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        dragState.showDragZone = true;
    }

    function unhighlight(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        dragState.showDragZone = false;
    }

    async function onDrop(ev) {
        ev.preventDefault();
        await component.env.bus.trigger("change_file_input", {
            files: ev.dataTransfer.files,
        });
    }

    useEffect(
        (el) => {
            if (!el) {
                return;
            }
            el.addEventListener("dragover", highlight);
            el.addEventListener("dragleave", unhighlight);
            el.addEventListener("drop", onDrop);
            return () => {
                el.removeEventListener("dragover", highlight);
                el.removeEventListener("dragleave", unhighlight);
                el.removeEventListener("drop", onDrop);
            };
        },
        () => [document.querySelector('.o_content')] // Maybe use a t-ref
    );

    return dragState;
}

export const ExpenseDocumentDropZone = {
    setup() {
        this._super();
        this.dragState = useState({
            showDragZone: false,
        });
        this.root = useRef("root");

        useEffect(
            (el) => {
                if (!el) {
                    return;
                }
                const highlight = this.highlight.bind(this);
                const unhighlight = this.unhighlight.bind(this);
                const drop = this.onDrop.bind(this);
                el.addEventListener("dragover", highlight);
                el.addEventListener("dragleave", unhighlight);
                el.addEventListener("drop", drop);
                return () => {
                    el.removeEventListener("dragover", highlight);
                    el.removeEventListener("dragleave", unhighlight);
                    el.removeEventListener("drop", drop);
                };
            },
            () => [document.querySelector('.o_content')]
        );
    },

    highlight(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.dragState.showDragZone = true;
    },

    unhighlight(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.dragState.showDragZone = false;
    },

    async onDrop(ev) {
        ev.preventDefault();
        // We should probably pass a callBack to the renderer or add a sub env in the controller with your bus
        await this.env.bus.trigger("change_file_input", {
            files: ev.dataTransfer.files,
        });        
    },
};

export const ExpenseDocumentUpload = {
    setup() {
        this._super();
        this.actionService = useService('action');
        this.notification = useService('notification');
        this.orm = useService('orm');
        this.http = useService('http');
        this.fileInput = useRef('fileInput');
        this.root = useRef("root");

        useBus(this.env.bus, "change_file_input", async (ev) => {
            this.fileInput.el.files = ev.detail.files;
            await this.onChangeFileInput();
        });
    },

    uploadDocument() {
        this.fileInput.el.click();
    },

    async onChangeFileInput() {
        const params = {
            csrf_token: odoo.csrf_token,
            ufile: [...this.fileInput.el.files],
            model: 'hr.expense',
            id: 0,
        };

        const fileData = await this.http.post('/web/binary/upload_attachment', params, "text");
        const attachments = JSON.parse(fileData);
        if (attachments.error) {
            throw new Error(attachments.error);
        }
        this.onUpload(attachments);
    },

    async onUpload(attachments) {
        const attachmentIds = attachments.map((a) => a.id);
        if (!attachmentIds.length) {
            this.notification.add(
                this.env._t('An error occurred during the upload')
            );
            return;
        }

        const action = await this.orm.call('hr.expense', 'create_expense_from_attachments', ["", attachmentIds]);
        this.actionService.doAction(action);
    },
};
