import { Component, onWillStart, plugin } from "@odoo/owl";
import { ControlPanel } from "@web_client/views/control_panel";
import { ViewPlugin } from "@web_client/views/view_plugin";
import { viewRegistry } from "@web_client/views/view_registry";
import { parseXml } from "@web_client/xml_parser";
import { ORM } from "@web_core/orm";

export class ListView extends Component {
    static {
        viewRegistry.add("list", this);
    }

    static template = "web_client.ListView";
    static components = { ControlPanel };

    /** @type {{ id: string; title: string; fieldName: string }[]} */
    columns = [];
    /** @type {Record<string, any>[]} */
    records = [];

    orm = plugin(ORM);
    view = plugin(ViewPlugin);

    setup() {
        const resModel = this.view.resModel();
        const fields = this.view.models()[resModel].fields;

        const arch = parseXml(this.view.archs()["list"]);
        console.log(arch);
        let id = 0;
        for (const child of arch.children) {
            if (child.tagName !== "field") {
                continue;
            }
            const name = String(child.getAttribute("name"));
            const title = child.getAttribute("string") || fields[name].string;
            this.columns.push({
                id: `field_${id++}`,
                title,
                fieldName: name,
            });
        }

        onWillStart(async () => {
            this.records = await this.orm.call(resModel, "search_read", {
                args: [[], ["id", ...this.columns.map((c) => c.fieldName)]],
                kwargs: {
                    limit: 20,
                },
            });
        });
    }
}
