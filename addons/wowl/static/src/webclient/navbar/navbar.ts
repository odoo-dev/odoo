import { Component, hooks } from "@odoo/owl";
import { OwlEvent } from "@odoo/owl/dist/types/core/owl_event";
import { useService } from "../../core/hooks";
import { MenuTree } from "../../services/menus";
import { OdooEnv } from "../../types";
import { Dropdown } from "../../components/dropdown/dropdown";
import { DropdownItem } from "../../components/dropdown/dropdown_item";
import { debounce } from "../../utils/ts/utility";
const { useExternalListener } = hooks;

export interface NavBarState {
  selectedApp: null | MenuTree;
}

export class NavBar extends Component<{}, OdooEnv> {
  static template = "wowl.NavBar";
  static components = { Dropdown, DropdownItem };
  currentAppSectionsExtra: MenuTree[] = [];
  actionManager = useService("action_manager");
  menuRepo = useService("menus");

  constructor(...args: any[]) {
    super(...args);
    const debouncedAdapt = debounce(this.adapt.bind(this), 250);
    useExternalListener(window, "resize", debouncedAdapt);
  }

  mounted() {
    this.adapt();
    const renderAndAdapt = async () => {
      await this.render();
      await this.adapt();
    };
    this.env.registries.systray.on("UPDATE", this, renderAndAdapt);
    this.env.bus.on("MENUS:APP-CHANGED", this, renderAndAdapt);
  }

  willUnmount() {
    this.env.registries.systray.off("UPDATE", this);
    this.env.bus.off("MENUS:APP-CHANGED", this);
  }

  get currentApp() {
    return this.menuRepo.getCurrentApp();
  }

  get currentAppSections() {
    return (this.currentApp && this.menuRepo.getMenuAsTree(this.currentApp.id).childrenTree) || [];
  }

  get systrayItems() {
    return this.env.registries.systray.getAll().sort((x, y) => {
      const xSeq = x.sequence ?? 50;
      const ySeq = y.sequence ?? 50;
      return ySeq - xSeq;
    });
  }

  protected async adapt() {
    // ------- Initialize -------
    // Check actual "more" dropdown state
    const moreDropdown = this.el!.querySelector<HTMLElement>(".o_menu_sections_more");
    const initialAppSectionsExtra = this.currentAppSectionsExtra;

    // Restore (needed to get offset widths)
    const sections = [
      ...this.el!.querySelectorAll<HTMLElement>(".o_menu_sections > *:not(.o_menu_sections_more)")!,
    ];
    sections.forEach((s) => s.classList.remove("d-none"));
    this.currentAppSectionsExtra = [];
    moreDropdown!.classList.add("d-none");

    // ------- Check overflowing sections -------
    const sectionsMenu = this.el!.querySelector<HTMLElement>(".o_menu_sections")!;
    const sectionsAvailableWidth = sectionsMenu.offsetWidth;
    const sectionsTotalWidth = sections.reduce((sum, s) => sum + s.offsetWidth, 0);

    if (sectionsAvailableWidth < sectionsTotalWidth) {
      // Sections are overflowing, show "more" menu
      moreDropdown!.classList.remove("d-none");

      let width = moreDropdown!.offsetWidth;
      for (const section of sections) {
        if (sectionsAvailableWidth < width + section.offsetWidth) {
          // Last sections are overflowing
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
    if (initialAppSectionsExtra.length === this.currentAppSectionsExtra.length) {
      // Do not render if more menu items stayed the same.
      return;
    }
    return this.render();
  }

  onNavBarDropdownItemSelection(ev: OwlEvent<{ payload: any }>) {
    const { payload: menu } = ev.detail;
    if (menu) {
      this.menuRepo.selectMenu(menu);
    }
  }
}
