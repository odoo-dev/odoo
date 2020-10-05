import { Component } from "@odoo/owl";
import { useService } from "../../services";

export class NavBar extends Component {
  static template = "wowl.NavBar";
  menuRepo = useService("menus");
  showDropdownMenu = false;
  toggleDropdownMenu = () => { this.showDropdownMenu = !this.showDropdownMenu; }
}
