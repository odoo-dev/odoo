import { Component } from "@odoo/owl";
import { ControlPanel } from "@web_client/views/control_panel";

export class ListView extends Component {
    static template = "web_client.ListView";
    static components = { ControlPanel };

    columns = [
        { id: "field_1", title: "Id", fieldName: "id" },
        { id: "field_2", title: "Name", fieldName: "name" },
    ];
    records = [
        { id: 1, name: "Mitchell Admin" },
        { id: 2, name: "Marc Demo" },
        { id: 5, name: "Joel Willis" },
        { id: 15, name: "Azure Interior" },
        { id: 16, name: "Azure Interior, Brandon Freeman" },
    ];
}
