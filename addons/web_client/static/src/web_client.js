import { Component } from "@odoo/owl";
import { Navbar } from "./navbar";

export class WebClient extends Component {
    static template = "web_client.WebClient";
    static components = { Navbar };
}