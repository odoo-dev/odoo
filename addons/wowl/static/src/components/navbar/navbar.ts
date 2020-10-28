import { Component, hooks, utils } from "@odoo/owl";
import { OwlEvent } from "@odoo/owl/dist/types/core/owl_event";
import { useService } from "../../core/hooks";
import { MenuTree } from "../../services/menus";
import { OdooEnv } from "../../types";
import { Dropdown } from "../dropdown/dropdown";
import { DropdownItem } from "../dropdown/dropdown_item";

export interface NavBarState {
  selectedApp: null | MenuTree;
}

export class NavBar extends Component<{}, OdooEnv> {
  static template = "wowl.NavBar";
  static components = { Dropdown, DropdownItem };
  actionManager = useService("action_manager");
  menuRepo = useService("menus");

  constructor(...args: any[]) {
    super(...args);
    hooks.onMounted(async () => {
      this._adapt();
      this.env.bus.on("MENUS:APP-CHANGED", this, async () => {
        await this.render();
        this._adapt();
      });
    });

    const _debouncedAdapt = utils.debounce(this._adapt.bind(this), 250);
    hooks.useExternalListener(window, "resize", _debouncedAdapt);
  }

  systrayItems = this._getSystrayItems();

  private async _adapt() {
    // ------- Initialize -------
    // Check actual "more" dropdown state
    const moreDropdown = this.el!.querySelector<HTMLElement>(".o_menu_sections_more");
    const initialMoreMenuVisible = !moreDropdown!.classList.contains("d-none");

    // Restore (needed to get offset widths)
    const sections = [
      ...this.el!.querySelectorAll<HTMLElement>(".o_menu_sections > *:not(.o_menu_sections_more)")!,
    ];
    sections.forEach((s) => s.classList.remove("d-none"));
    moreDropdown!.classList.add("d-none");
    let actualMoreMenuVisible = false;

    // ------- Check overflowing sections -------
    const sectionsMenu = this.el!.querySelector<HTMLElement>(".o_menu_sections")!;
    const sectionsAvailableWidth = sectionsMenu.offsetWidth;
    const sectionsTotalWidth = sections.reduce((sum, s) => sum + s.offsetWidth, 0);

    if (sectionsAvailableWidth < sectionsTotalWidth) {
      // Sections are overflowing, show "more" menu
      moreDropdown!.classList.remove("d-none");
      actualMoreMenuVisible = true;

      let width = moreDropdown!.offsetWidth;
      for (const section of sections) {
        if (sectionsAvailableWidth < width + section.offsetWidth) {
          // Last sections are overflowing
          this.currentAppSectionsExtra = [];
          const overflowingSections = sections.slice(sections.indexOf(section));
          overflowingSections.forEach((s) => {
            // Hide from normal menu
            s.classList.add("d-none");
            // Show inside "more" menu
            const sectionId = s.querySelector("[data-section]")!.getAttribute("data-section")!;
            const currentAppSection = this.currentAppSections.find(
              (appSection) => appSection.id.toString() === sectionId
            );
            this.currentAppSectionsExtra.push(currentAppSection!);
          });
          break;
        }
        width += section.offsetWidth;
      }
    }

    // ------- Final rendering -------
    if (!initialMoreMenuVisible && !actualMoreMenuVisible) {
      // Do not render if there is no need.
      return;
    }
    return this.render();
  }

  _getSystrayItems() {
    return this.env.registries.systray.getAll().sort((x, y) => {
      const xSeq = x.sequence ?? 50;
      const ySeq = y.sequence ?? 50;
      return ySeq - xSeq;
    });
  }

  onNavBarDropdownItemSelection(ev: OwlEvent<{ payload: any }>) {
    const { payload: menu } = ev.detail;
    if (menu) {
      this.menuRepo.selectMenu(menu);
    }
  }

  get currentApp() {
    return this.menuRepo.getCurrentApp();
  }

  get currentAppSections() {
    return (this.currentApp && this.menuRepo.getMenuAsTree(this.currentApp.id).childrenTree) || [];
  }

  currentAppSectionsExtra: MenuTree[] = [];
}
