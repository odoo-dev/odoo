 /** @odoo-module **/

import { actionRegistry } from "@wowl/actions/action_registry";
import { ComponentAdapter } from "web.OwlCompatibility";
import { computeHomeMenuProps } from "@wowl/web_enterprise/webclient/home_menu/home_menu_service";
import { useService } from "@wowl/core/hooks";

import { StudioNavbar } from "./navbar/navbar";
import { Editor } from "./editor/editor";
import { AppCreatorWrapper } from "./app_creator/app_creator";
import { StudioHomeMenu } from "./studio_home_menu/studio_home_menu";

const { Component } = owl;

export class StudioClientAction extends Component {
  setup() {
    this.studio = useService("studio");
    this.menus = useService("menu");
    this.homeMenuProps = computeHomeMenuProps(this.menus.getMenuAsTree("root"));

    this.AppCreatorWrapper = AppCreatorWrapper; // to remove
  }

  willStart() {
    return this.studio.ready;
  }

  mounted() {
    this.studio.pushState();
    this.studio.bus.on("UPDATE", this, this.render);
    document.body.classList.add("o_in_studio"); // FIXME ?
  }

  patched() {
    this.studio.pushState();
  }

  willUnmount() {
    this.studio.bus.off("UPDATE", this);
    document.body.classList.remove("o_in_studio");
  }
}
StudioClientAction.template = "web_studio.StudioClientAction";
StudioClientAction.components = {
  StudioNavbar,
  StudioHomeMenu,
  ComponentAdapter, // to be replaced by AppCreator
  Editor,
};
StudioClientAction.forceFullscreen = true;

actionRegistry.add("studio", StudioClientAction);
