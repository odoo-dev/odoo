/** @ts-check */

import { OdooCorePlugin } from "@spreadsheet/plugins";
import { registries, coreTypes } from "@odoo/o-spreadsheet";

const DEFAULT_CONTENT = `<div data-name="Mailing" class="o_layout oe_unremovable oe_unmovable o_empty_theme" style="background-color: #F7F7F7;"><div class="container o_mail_wrapper o_mail_regular oe_unremovable"><div class="row mw-100 mx-0"><div class="col o_mail_no_options o_mail_wrapper_td bg-white oe_structure o_savable oe_empty o_dirty" data-editor-message-default="true" data-editor-message="Drag blocks here" contenteditable="true"><section class="s_three_columns o_mail_snippet_general o_cc pt32 pb32" data-vxml="001" data-snippet="s_three_columns" data-name="Columns" contenteditable="false">
        <div class="container" contenteditable="true">
            <div class="row">
                <div class="o_mail_no_colorpicker pt16 pb16 col-12 col-md-12 o_draggable">
                    <div class="card text-bg-white h-100">
                        <div class="o_not_editable" contenteditable="false">
                            <img class="card-img-top o_editable_media" src="/web/image/mass_mailing.s_three_columns_default_image_1" alt="" data-mimetype="image/jpeg">
                        </div>
                        <div class="card-body">
                            <h3 class="card-title" style="font-size: 18px;">Feature One</h3>
                            <p class="card-text">Adapt these three columns to fit your design need. To duplicate, delete or move columns, select the column and use the top icons to perform your action.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section></div></div></div></div>`;

export class DashboardContentPlugin extends OdooCorePlugin {
    static getters = ["getDashboardContent"];

    handle(cmd) {
        switch (cmd.type) {
            case "SET_DASHBOARD_CONTENT":
                this.history.update("content", cmd.content);
                break;
        }
    }

    getDashboardContent() {
        return this.content || DEFAULT_CONTENT;
    }

    import(data) {
        this.history.update("content", data.content);
    }

    export(data) {
        data.content = this.getDashboardContent();
    }
}

registries.corePluginRegistry.add("DashboardContentPlugin", DashboardContentPlugin);
coreTypes.add("SET_DASHBOARD_CONTENT");
