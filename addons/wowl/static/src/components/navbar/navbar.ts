import { Component, useState } from "@odoo/owl";
import { useService } from "../../services";

export class NavBar extends Component {
  static template = "wowl.NavBar";
  menuRepo = useService("menus");
  state = useState({ showDropdownMenu: false });
  toggleDropdownMenu = () => {
    this.state.showDropdownMenu = !this.state.showDropdownMenu;
  };
}
