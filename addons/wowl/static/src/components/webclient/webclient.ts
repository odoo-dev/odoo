import { Action } from "../action/action";
import { ActionContainer } from "../../services/action_manager/action_manager";
import { Component } from "@odoo/owl";
import { NavBar } from "../navbar/navbar";
import { OdooEnv } from "../../env";

export class WebClient extends Component<{}, OdooEnv> {
  static components = { Action, ActionContainer, NavBar };
  static template = "wowl.WebClient";
  Components = this.env.registries.Components.getEntries();
}
