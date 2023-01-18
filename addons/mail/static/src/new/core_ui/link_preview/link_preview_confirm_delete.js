/* @odoo-module */

import { useService } from "@web/core/utils/hooks";
import { Component } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";

/**
 * @typedef {Object} Props
 * @property {import("@mail/new/core/link_preview_model").LinkPreview} linkPreview
 * @property {function} close
 * @property {Component} LinkPreviewListComponent
 * @extends {Component<Props, Env>}
 */
export class LinkPreviewConfirmDelete extends Component {
    static components = { Dialog };
    static props = ["linkPreview", "close", "LinkPreviewListComponent"];
    static template = "mail.link_preview_confirm_delete";

    setup() {
        this.rpc = useService("rpc");
    }

    onClickOk() {
        this.rpc(
            "/mail/link_preview/delete",
            { link_preview_id: this.props.linkPreview.id },
            { shadow: true }
        );
        this.props.close();
    }

    onClickCancel() {
        this.props.close();
    }
}
