/** @odoo-module **/
const { Component } = owl;
import { useService } from "../../core/hooks";
import { useSearch, useSetupView } from "../view_utils/hooks";
import { Layout } from "../view_utils/layout/layout";
import { FilterMenu } from "../view_utils/filter_menu/filter_menu";
import { FavoriteMenu } from "../view_utils/favorite_menu/favorite_menu";
import { GroupByMenu } from "../view_utils/group_by_menu/group_by_menu";
import { SearchBar } from "../view_utils/search_bar/search_bar";
import { ListModel } from "./list_model";
import { ViewNotFoundError } from "../../action_manager/action_manager";
export class ListView extends Component {
  constructor() {
    super(...arguments);
    this._actionManagerService = useService("action_manager");
    this._modelService = useService("model");
    this.searchModel = useSearch({
      onSearchUpdate: async () => {
        const { domain } = this.searchModel;
        await this.model.load(domain);
        this.render();
      },
    });
    this.fields = this.processArch(this.props.arch);
    useSetupView({});
    const Model = this.constructor.Model;
    this.model = new Model(this._modelService, this.props.model, this.fields);
  }
  async willStart() {
    const { domain } = this.searchModel;
    return this.model.load(domain, {
      limit: this.props.limit,
    });
  }
  processArch(arch) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(arch, "text/xml");
    const xml = doc.documentElement;
    const fields = [...xml.querySelectorAll("field")];
    return fields.map((elem) => {
      return {
        name: elem.getAttribute("name"),
        invisible: elem.getAttribute("invisible") || false,
        optional: elem.getAttribute("optional") || false,
      };
    });
  }
  async _onRowClicked(id) {
    try {
      await this._actionManagerService.switchView("form", {
        recordId: id,
        recordIds: this.model.records.map((r) => r.id),
      });
    } catch (e) {
      if (!(e instanceof ViewNotFoundError)) {
        throw e;
      }
    }
  }
}
ListView.display_name = "list";
ListView.icon = "fa-list-ul";
ListView.multiRecord = true;
ListView.type = "list";
ListView.template = "wowl.ListView";
ListView.components = { Layout, FavoriteMenu, FilterMenu, GroupByMenu, SearchBar }; // Layout, FilterMenu... could be added by useSetupView?
ListView.Model = ListModel;
//   static style = css`
//     .o_list_view {
//       .o_list_table {
//         thead {
//           background-color: #eee;
//           color: #4c4c4c;
//           border-bottom: 1px solid #cacaca;
//         }
//         th,
//         .o_data_cell {
//           font-size: 13px;
//           white-space: nowrap;
//           padding: 6px 3px;
//         }
//         .o_data_row {
//           cursor: pointer;
//         }
//       }
//     }
//   `;
//   am = useService("action_manager");
//   _onRowClicked(id: number) {
//     this.am.switchView("form", { recordId: id, recordIds: this.props.records.map((r) => r.id) });
//   }
// }
// interface ListControllerState {
//   records: DBRecord[];
// }
// export class ListView extends BaseView {
//   static display_name = "list";
//   static icon = "fa-list-ul";
//   static multiRecord = true;
//   static type = "list";
// static components = { ...View.components, Renderer: ListRenderer, Pager };
// modelService = useService("model");
// cpSubTemplates: ControlPanelSubTemplates = {
//   ...this.cpSubTemplates,
//   bottomRight: "wowl.ListView.ControlPanelBottomRight",
// };
// state: ListControllerState = useState({
//   records: [],
// });
// fieldNames: string[] = [];
// pager = usePager("pager", {
//   limit: 5,
//   onPagerChanged: this.onPagerChanged.bind(this),
// });
// async willStart() {
//   await super.willStart();
//   await this.loadRecords({ limit: this.pager.limit, offset: this.pager.currentMinimum - 1 });
// }
// async loadRecords(options: any = {}) {
//   const fieldTypes = ["char", "text", "integer", "float", "many2one"];
//   const fields = this.viewDescription.fields;
//   this.fieldNames = Object.keys(fields).filter((fieldName: string) =>
//     fieldTypes.includes(fields[fieldName].type)
//   );
//   const domain = this.props.domain;
//   const context = this.props.context;
//   const model = this.modelService(this.props.model);
//   const result = await model.searchRead(domain, this.fieldNames, options, context);
//   this.pager.size = result.length;
//   this.state.records = result.records;
// }
// get rendererProps(): ListRendererProps {
//   const props: any = super.rendererProps;
//   props.fieldNames = this.fieldNames;
//   props.records = this.state.records;
//   return props;
// }
// async onPagerChanged(currentMinimum: number, limit: number) {
//   await this.loadRecords({ limit, offset: currentMinimum - 1 });
//   return {};
// }
// }
