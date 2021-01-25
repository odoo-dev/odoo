/** @odoo-module **/
const { Component, hooks } = owl;
import { useSetupAction } from "../../action_manager/action_manager";
import { Domain } from "../../core/domain";
import { useService } from "../../core/hooks";
import { SearchModel } from "./search_model";
import { Layout } from "./layout/layout";
import { FilterMenu } from "./filter_menu/filter_menu";
import { GroupByMenu } from "./group_by_menu/group_by_menu";
import { ComparisonMenu } from "./comparison_menu/comparison_menu";
import { FavoriteMenu } from "./favorite_menu/favorite_menu";
import { SearchBar } from "./search_bar/search_bar";
import { Dropdown } from "../../components/dropdown/dropdown";
import { DropdownItem } from "../../components/dropdown/dropdown_item";

const { onMounted } = hooks;
export function useSearch(params) {
  const component = Component.current;
  const props = component.props;
  const _localizationService = useService("localization");
  const _modelService = useService("model");
  const _userService = useService("user");
  const { irFilters, fields, preSearchItems } = props.processedSearchViewDescription || {};
  const globalContext = props.context || {};
  const globalDomain = new Domain(props.domain || []);
  const searchMenuTypes = params.searchMenuTypes;
  const onSaveParams = params.onSaveParams;
  const searchModel = new SearchModel({
    env: component.env,
    modelName: props.model,
    _localizationService,
    _modelService,
    _userService,
    irFilters,
    fields,
    preSearchItems,
    globalContext,
    globalDomain,
    searchMenuTypes,
    onSaveParams,
  });
  if (params.onSearchUpdate) {
    searchModel.on("update", null, params.onSearchUpdate.bind(component));
  }
  return searchModel;
}
export function useSetupView(setup) {
  const component = Component.current;
  const props = component.props;
  const title = useService("title");

  component.constructor.components = {
    Layout,
    FilterMenu,
    GroupByMenu,
    ComparisonMenu,
    FavoriteMenu,
    SearchBar,
    Dropdown,
    DropdownItem,
    ...component.constructor.components,
  }

  useSetupAction({
    export: setup.export,
    beforeLeave: setup.beforeLeave,
  });
  // should probably do this only in main mode, not in a dialog or something...
  onMounted(() => {
    title.setParts({ action: props.action.name });
  });
}
