import { ActionContainer } from "../../services/action_manager/action_manager";
import { Component } from "@odoo/owl";
import { NavBar } from "../navbar/navbar";
import { OdooEnv } from "../../types";

export class WebClient extends Component<{}, OdooEnv> {
  static components = { ActionContainer, NavBar };
  static template = "wowl.WebClient";
  Components = this.env.registries.Components.getEntries();
}
