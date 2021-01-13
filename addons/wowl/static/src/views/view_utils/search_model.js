/** @odoo-module **/
const { core } = owl;
import { makeContext } from "../../core/context";
import { combineDomains, Domain } from "../../core/domain";
import { getGroupBy } from "../view_utils/group_by";
import {
  DEFAULT_INTERVAL,
  getComparisonOptions,
  getPeriodOptions,
  getIntervalOptions,
  yearSelected,
  constructDateDomain,
  rankInterval,
  FACET_ICONS,
} from "./search_utils";
import { evaluateExpr } from "../../py/index";
const { DateTime } = luxon;
const { EventBus } = core;
//--------------------------------------------------------------------------
// Global variables/constants
//--------------------------------------------------------------------------
const FAVORITE_PRIVATE_GROUP = 1;
const FAVORITE_SHARED_GROUP = 2;
const DISABLE_FAVORITE = "search_disable_custom_filters";
let nextId = 1;
let nextGroupId = 1;
let nextGroupNumber = 1;
export class SearchModel extends EventBus {
  constructor(config) {
    super();
    this.actionId = false; // hum
    this.defaultFavoriteId = null;
    this.blockNotification = true;
    this.searchItems = {};
    this.query = [];
    this.referenceMoment = DateTime.local();
    this.__context = null;
    this.__groupBy = null;
    this.__domain = null;
    this.__domains = null;
    this.__orderedBy = null;
    this.env = config.env;
    this.modelName = config.modelName;
    this._localizationService = config._localizationService;
    this._userService = config._userService;
    this._modelService = config._modelService;
    this.searchMenuTypes = new Set(config.searchMenuTypes || ["filter", "groupBy", "favorite"]);
    this.fields = config.fields || {};
    this.onSaveParams = config.onSaveParams;
    this.comparisonOptions = getComparisonOptions();
    this.optionGenerators = getPeriodOptions(this.referenceMoment);
    this.intervalOptions = getIntervalOptions();
    this.globalDomain = config.globalDomain || new Domain([]);
    this.globalContext = config.globalContext || {};
    const defaultFavoriteId = this.createGroupOfFavorites(config.irFilters || []);
    const activateFavorite =
      DISABLE_FAVORITE in this.globalContext ? this.globalContext[DISABLE_FAVORITE] : true;
    this.defaultFavoriteId = activateFavorite ? defaultFavoriteId : null;
    for (const preGroup of config.preSearchItems || []) {
      this.createGroupOfSearchItems(preGroup);
    }
    nextGroupNumber =
      1 + Math.max(...Object.values(this.searchItems).map((i) => i.groupNumber || 0), 0);
    const dateFilters = Object.values(this.searchItems).filter(
      (searchElement) => searchElement.type === "dateFilter"
    );
    if (dateFilters.length) {
      this.createGroupOfComparisons(dateFilters);
    }
    if (config.dynamicFilters) {
      console.warn(
        this.env._t(
          `The key "dynamicFilters" has been deprecated: use "preSearchItems" key in a suitable way`
        )
      );
      this.createGroupOfDynamicFilters(config.dynamicFilters);
    }
    this.activateDefaultFilters();
    this.blockNotification = false;
  }
  notify() {
    if (this.blockNotification) {
      return;
    }
    this.__context = null;
    this.__domain = null;
    this.__domains = null;
    this.__groupBy = null;
    this.__orderedBy = null;
    this.trigger("update");
  }
  //--------------------------------------------------------------------------
  // Getters
  //--------------------------------------------------------------------------
  get context() {
    if (!this.__context) {
      this.__context = makeContext(this.globalContext, this.getContext());
    }
    return this.__context;
  }
  get domain() {
    if (!this.__domain) {
      this.__domain = combineDomains([this.globalDomain, this.getDomain()], "AND").toList(
        this._userService.context
      );
    }
    return this.__domain;
  }
  get domains() {
    if (!this.__domains) {
      this.__domains = [this.domain]; /** for comparisons @todo  to adapt: find best api */
    }
    return this.__domains;
  }
  get groupBy() {
    if (!this.__groupBy) {
      this.__groupBy = this.getGroupBy();
    }
    return this.__groupBy;
  }
  get orderedBy() {
    if (!this.__orderedBy) {
      this.__orderedBy = this.getOrderedBy();
    }
    return this.__orderedBy;
  }
  get facets() {
    const isValidType = (type) =>
      !["groupBy", "comparison"].includes(type) || this.searchMenuTypes.has(type);
    const facets = [];
    for (const facet of this.getFacets()) {
      if (!isValidType(facet.type)) {
        continue;
      }
      facets.push(facet);
    }
    return facets;
  }
  /**
   * Return an array containing enriched copies of the searchElements of the provided type.
   */
  getSearchItems(predicate) {
    const searchItems = [];
    Object.values(this.searchItems).forEach((searchItem) => {
      if (
        (!("invisible" in searchItem) || !searchItem.invisible) &&
        (!predicate || predicate(searchItem))
      ) {
        const enrichedSearchitem = this.enrichItem(searchItem);
        if (enrichedSearchitem) {
          searchItems.push(enrichedSearchitem);
        }
      }
    });
    if (searchItems.some((f) => f.type === "favorite")) {
      searchItems.sort((f1, f2) => f1.groupNumber - f2.groupNumber);
    }
    return searchItems;
  }
  //--------------------------------------------------------------------------
  // "Actions"
  //--------------------------------------------------------------------------
  /**
   * Activate a filter of type 'field' with given filterId with
   * 'autocompleteValues' value, label, and operator.
   * @param {Object}
   */
  addAutoCompletionValues(searchItemId, autocompleteValue) {
    const searchItem = this.searchItems[searchItemId];
    if (searchItem.type !== "field") {
      return;
    }
    const { label, value, operator } = autocompleteValue;
    const queryElem = this.query.find(
      (queryElem) =>
        queryElem.searchItemId === searchItemId &&
        "autocompleteValue" in queryElem &&
        queryElem.autocompleteValue.value === value &&
        queryElem.autocompleteValue.operator === operator
    );
    if (!queryElem) {
      this.query.push({ searchItemId, autocompleteValue });
    } else {
      queryElem.autocompleteValue.label = label;
    }
    this.notify();
  }
  /**
   * Remove all the query elements from query.
   */
  clearQuery() {
    this.query = [];
    this.notify();
  }
  /**
   * Create a new filter of type 'favorite' and activate it.
   * A new group containing only that filter is created.
   * The query is emptied before activating the new favorite.
   * @param {Object} preFilter
   * @returns {Promise}
   */
  async createNewFavorite(params) {
    const { description, isDefault, isShared } = params;
    const userContext = this._userService.context;
    let controllerQueryParams = {};
    if (this.onSaveParams) {
      controllerQueryParams = this.onSaveParams();
    }
    controllerQueryParams.context = controllerQueryParams.context || {};
    const queryContext = this.getContext();
    const context = makeContext(userContext, controllerQueryParams.context, queryContext);
    for (const key in userContext) {
      delete context[key];
    }
    for (const key in context) {
      // clean search defaults from context --> could be removed I think
      const match = /^search_default_(.*)$/.exec(key);
      if (match) {
        delete context[key];
      }
    }
    const domain = this.getDomain();
    const groupBys = this.getGroupBy();
    const comparison = this.getComparison();
    const orderedBy = controllerQueryParams.orderedBy
      ? controllerQueryParams.orderedBy
      : this.getOrderedBy() || [];
    const userId = isShared ? false : this._userService.userId;
    const serverSideId = await this._modelService("ir.filters").call("create_or_replace", [
      {
        name: description,
        action_id: this.actionId,
        model_id: this.modelName,
        domain: domain.toString(),
        is_default: isDefault,
        sort: JSON.stringify(orderedBy.map((o) => `${o.name}${o.asc === false ? " desc" : ""}`)),
        user_id: userId,
        context: Object.assign({ group_by: groupBys }, comparison ? { comparison } : {}, context),
      },
    ]);
    // before the filter cache was cleared!
    this.blockNotification = true;
    this.clearQuery();
    const favorite = {
      type: "favorite",
      id: nextId,
      groupId: nextGroupId,
      context,
      domain,
      groupBys,
      groupNumber: userId ? FAVORITE_PRIVATE_GROUP : FAVORITE_SHARED_GROUP,
      orderedBy,
      removable: true,
      userId,
      description,
      serverSideId,
    };
    if (comparison) {
      favorite.comparison = comparison;
    }
    if (isDefault) {
      favorite.isDefault = isDefault;
    }
    this.searchItems[nextId] = favorite;
    this.query.push({ searchItemId: nextId });
    nextGroupId++;
    nextId++;
    this.blockNotification = false;
    this.notify();
  }
  /**
   * Create new search items of type 'filter' and activate them.
   * A new group containing only those filters is created.
   */
  createNewFilters(prefilters) {
    if (!prefilters.length) {
      return [];
    }
    prefilters.forEach((preFilter) => {
      const filter = Object.assign(preFilter, {
        groupId: nextGroupId,
        groupNumber: nextGroupNumber,
        id: nextId,
        type: "filter",
      });
      this.searchItems[nextId] = filter;
      this.query.push({ searchItemId: nextId });
      nextId++;
    });
    nextGroupId++;
    nextGroupNumber++;
    this.notify();
  }
  /**
   * Create a new filter of type 'groupBy' and activate it.
   * It is added to the unique group of groupbys.
   */
  createNewGroupBy(field) {
    const { name: fieldName, string, type: fieldType } = field;
    const firstGroupBy = Object.values(this.searchItems).find((f) => f.type === "groupBy");
    const preSearchItem = {
      description: string || fieldName,
      fieldName,
      fieldType,
      groupId: firstGroupBy ? firstGroupBy.groupId : nextGroupId++,
      groupNumber: nextGroupNumber,
      id: nextId,
    };
    if (["date", "datetime"].includes(field.type)) {
      this.searchItems[nextId] = Object.assign(
        { type: "dateGroupBy", defaultIntervalId: DEFAULT_INTERVAL },
        preSearchItem
      );
      this.toggleDateGroupBy(nextId);
    } else {
      this.searchItems[nextId] = Object.assign({ type: "groupBy" }, preSearchItem);
      this.toggleSearchItem(nextId);
    }
    nextGroupNumber++;
    nextId++;
    this.notify();
  }
  /**
   * Deactivate a group with provided groupId, i.e. delete the query elements
   * with given groupId.
   */
  deactivateGroup(groupId) {
    this.query = this.query.filter((queryElem) => {
      const searchItem = this.searchItems[queryElem.searchItemId];
      return searchItem.groupId !== groupId;
    });
    this.checkComparisonStatus();
    this.notify();
  }
  /**
   * Delete a filter of type 'favorite' with given nextId server side and
   * in control panel model. Of course the filter is also removed
   * from the search query.
   */
  async deleteFavorite(favoriteId) {
    const searchItem = this.searchItems[favoriteId];
    if (searchItem.type !== "favorite") {
      return;
    }
    const { serverSideId } = searchItem;
    await this._modelService("ir.filters").unlink([
      serverSideId,
    ]); /** @todo we should maybe expose some method in view_manager: before, the filter cache was invalidated */
    const index = this.query.findIndex((queryElem) => queryElem.searchItemId === favoriteId);
    delete this.searchItems[favoriteId];
    if (index >= 0) {
      this.query.splice(index, 1);
    }
    this.notify();
  }
  /**
   * Activate or deactivate the simple filter with given filterId, i.e.
   * add or remove a corresponding query element.
   */
  toggleSearchItem(searchItemId) {
    const searchItem = this.searchItems[searchItemId];
    switch (searchItem.type) {
      case "dateFilter":
      case "dateGroupBy":
      case "field":
        return;
    }
    const index = this.query.findIndex((queryElem) => queryElem.searchItemId === searchItemId);
    if (index >= 0) {
      this.query.splice(index, 1);
    } else {
      if (searchItem.type === "favorite") {
        this.query = [];
      } else if (searchItem.type === "comparison") {
        // make sure only one comparison can be active
        this.query = this.query.filter((queryElem) => {
          const { type } = this.searchItems[queryElem.searchItemId];
          return type !== "comparison";
        });
      }
      this.query.push({ searchItemId });
    }
    this.notify();
  }
  toggleDateGroupBy(searchItemId, intervalId) {
    const searchItem = this.searchItems[searchItemId];
    if (searchItem.type !== "dateGroupBy") {
      return;
    }
    intervalId = intervalId || searchItem.defaultIntervalId;
    const index = this.query.findIndex(
      (queryElem) =>
        queryElem.searchItemId === searchItemId &&
        "intervalId" in queryElem &&
        queryElem.intervalId === intervalId
    );
    if (index >= 0) {
      this.query.splice(index, 1);
    } else {
      this.query.push({ searchItemId, intervalId });
    }
    this.notify();
  }
  /**
   * Used to toggle a query element.
   * This can impact the query in various form, e.g. add/remove other query elements
   * in case the filter is of type 'filter'.
   */
  toggleDateFilter(searchItemId, generatorId) {
    const searchItem = this.searchItems[searchItemId];
    if (searchItem.type !== "dateFilter") {
      return;
    }
    generatorId = generatorId || searchItem.defaultGeneratorId;
    const index = this.query.findIndex(
      (queryElem) =>
        queryElem.searchItemId === searchItemId &&
        "generatorId" in queryElem &&
        queryElem.generatorId === generatorId
    );
    if (index >= 0) {
      this.query.splice(index, 1);
      if (!yearSelected(this.getSelectedGeneratorIds(searchItemId))) {
        // This is the case where generatorId was the last option
        // of type 'year' to be there before being removed above.
        // Since other options of type 'month' or 'quarter' do
        // not make sense without a year we deactivate all options.
        this.query = this.query.filter((queryElem) => queryElem.searchItemId !== searchItemId);
      }
    } else {
      this.query.push({ searchItemId, generatorId });
      if (!yearSelected(this.getSelectedGeneratorIds(searchItemId))) {
        // Here we add 'this_year' as options if no option of type
        // year is already selected.
        const { defaultYearId } = this.optionGenerators.find((o) => o.id === generatorId);
        this.query.push({ searchItemId, generatorId: defaultYearId });
      }
    }
    this.checkComparisonStatus();
    this.notify();
  }
  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------
  /**
   * If a comparison is active, check if it should become inactive.
   * The comparison should become inactive if the corresponding date filter has become
   * inactive.
   */
  checkComparisonStatus() {
    const activeComparison = this.getActiveComparison();
    if (!activeComparison) {
      return;
    }
    const { dateFilterId, id } = activeComparison;
    const dateFilterIsActive = this.query.some(
      (queryElem) => queryElem.searchItemId === dateFilterId
    );
    if (!dateFilterIsActive) {
      this.query = this.query.filter((queryElem) => queryElem.searchItemId !== id);
    }
  }
  /**
   * Add filters of type 'filter' determined by the key array dynamicFilters.
   */
  createGroupOfDynamicFilters(dynamicFilters) {
    const pregroup = dynamicFilters.map((filter) => {
      return {
        groupNumber: nextGroupNumber,
        description: filter.description,
        domain: new Domain(filter.domain),
        isDefault: true,
        type: "filter",
      };
    });
    nextGroupNumber++;
    this.createGroupOfSearchItems(pregroup);
  }
  /**
   * Starting from a date filter id, returns the array of option ids currently selected
   * for the corresponding date filter.
   */
  getSelectedGeneratorIds(dateFilterId) {
    const selectedOptionIds = [];
    for (const queryElem of this.query) {
      if (queryElem.searchItemId === dateFilterId && "generatorId" in queryElem) {
        selectedOptionIds.push(queryElem.generatorId);
      }
    }
    return selectedOptionIds;
  }
  /**
   * Activate the default favorite (if any) or all default filters.
   */
  activateDefaultFilters() {
    if (this.defaultFavoriteId) {
      // Activate default favorite
      this.toggleSearchItem(this.defaultFavoriteId);
    } else {
      // Activate default filters
      Object.values(this.searchItems)
        .filter((f) => f.isDefault && f.type !== "favorite")
        .sort((f1, f2) => (f1.defaultRank || 100) - (f2.defaultRank || 100))
        .forEach((f) => {
          if (f.type === "dateFilter") {
            this.toggleDateFilter(f.id);
          } else if (f.type === "dateGroupBy") {
            this.toggleDateGroupBy(f.id);
          } else if (f.type === "field") {
            this.addAutoCompletionValues(f.id, f.defaultAutocompleteValue);
          } else {
            this.toggleSearchItem(f.id);
          }
        });
    }
  }
  /**
   * Starting from the array of date filters, create the filters of type
   * 'comparison'.
   * @private
   * @param {Object[]} dateFilters
   */
  createGroupOfComparisons(dateFilters) {
    const preSearchItem = [];
    for (const dateFilter of dateFilters) {
      for (const comparisonOption of this.comparisonOptions) {
        const { id: dateFilterId, description } = dateFilter;
        const preFilter = {
          type: "comparison",
          comparisonOptionId: comparisonOption.id,
          description: `${description}: ${comparisonOption.description}`,
          dateFilterId,
        };
        preSearchItem.push(preFilter);
      }
    }
    this.createGroupOfSearchItems(preSearchItem);
  }
  /**
   * Add filters of type 'favorite' determined by the array this.favoriteFilters.
   */
  createGroupOfFavorites(irFilters) {
    let defaultFavoriteId = null;
    irFilters.forEach((irFilter) => {
      const favorite = this.irFilterToFavorite(irFilter);
      this.createGroupOfSearchItems([favorite]);
      if (favorite.isDefault) {
        defaultFavoriteId = favorite.id;
      }
    });
    return defaultFavoriteId;
  }
  /**
   * Using a list (a 'pregroup') of 'prefilters', create new filters in `searchItems`
   * for each prefilter. The new filters belong to a same new group.
   */
  createGroupOfSearchItems(pregroup) {
    pregroup.forEach((preSearchItem) => {
      const searchItem = Object.assign(preSearchItem, {
        groupId: nextGroupId,
        id: nextId,
      });
      this.searchItems[nextId] = searchItem;
      nextId++;
    });
    nextGroupId++;
  }
  /**
   * Returns null or a copy of the provided filter with additional information
   * used only outside of the control panel model, like in search bar or in the
   * various menus. The value null is returned if the filter should not appear
   * for some reason.
   */
  enrichItem(searchItem) {
    const queryElements = this.query.filter(
      (queryElem) => queryElem.searchItemId === searchItem.id
    );
    const isActive = Boolean(queryElements.length);
    const enrichSearchItem = Object.assign({ isActive }, searchItem);
    function _enrichOptions(options, selectedIds) {
      return options.map((o) => {
        const { description, id, groupNumber } = o;
        const isActive = selectedIds.some((optionId) => optionId === id);
        return { description, id, groupNumber, isActive };
      });
    }
    switch (searchItem.type) {
      case "comparison": {
        const { dateFilterId } = searchItem;
        const dateFilterIsActive = this.query.some(
          (queryElem) => queryElem.searchItemId === dateFilterId
        );
        if (!dateFilterIsActive) {
          return null;
        }
        break;
      }
      case "dateFilter":
        enrichSearchItem.options = _enrichOptions(
          this.optionGenerators,
          queryElements.map((queryElem) => queryElem.generatorId)
        );
        break;
      case "dateGroupBy":
        enrichSearchItem.options = _enrichOptions(
          this.intervalOptions,
          queryElements.map((queryElem) => queryElem.intervalId)
        );
        break;
      case "field":
        enrichSearchItem.autocompleteValues = queryElements.map(
          (queryElem) => queryElem.autocompleteValue
        );
        break;
    }
    return enrichSearchItem;
  }
  getActiveComparison() {
    for (const queryElem of this.query) {
      const searchItem = this.searchItems[queryElem.searchItemId];
      if (searchItem.type === "comparison") {
        return searchItem;
      }
    }
    return null;
  }
  /**
   * Construct a single context from the contexts of
   * filters of type 'filter', 'favorite', and 'field'.
   * @private
   * @returns {Object}
   */
  getContext() {
    const groups = this.getGroups();
    const contexts = [];
    for (const group of groups) {
      for (const activeItem of group.activeItems) {
        const context = this.getSearchItemContext(activeItem);
        if (context) {
          contexts.push(context);
        }
      }
    }
    // const evaluationContext = this._userService.context;
    try {
      return {};
      // return pyUtils.eval('contexts', contexts, evaluationContext);
    } catch (err) {
      throw new Error(
        `${this.env._t("Failed to evaluate search context")}:\n${JSON.stringify(err)}`
      );
    }
  }
  /**
   * Return the context of the provided (active) filter.
   */
  getSearchItemContext(activeItem) {
    const { searchItemId } = activeItem;
    const searchItem = this.searchItems[searchItemId];
    switch (searchItem.type) {
      case "field":
        // for <field> nodes, a dynamic context (like context="{'field1': self}")
        // should set {'field1': [value1, value2]} in the context
        let context = {};
        if (searchItem.context) {
          try {
            const self = activeItem.autocompletValues.map(
              (autocompleValue) => autocompleValue.value
            );
            context = evaluateExpr(searchItem.context, { self });
            if (typeof context !== "object") {
              throw Error();
            }
          } catch (err) {
            throw new Error(
              `${this.env._t("Failed to evaluate field context")}:\n${JSON.stringify(err)}`
            );
          }
        }
        // the following code aims to remodel this:
        // https://github.com/odoo/odoo/blob/12.0/addons/web/static/src/js/views/search/search_inputs.js#L498
        // this is required for the helpdesk tour to pass
        // this seems weird to only do that for m2o fields, but a test fails if
        // we do it for other fields (my guess being that the test should simply
        // be adapted)
        if (searchItem.isDefault && searchItem.fieldType === "many2one") {
          context[`default_${searchItem.fieldName}`] = searchItem.defaultAutocompleteValue.value;
        }
        return context;
      case "favorite":
      case "filter":
        return makeContext(searchItem.context);
      default:
        return null;
    }
  }
  /**
   * Return a domain created by combinining appropriately (with an 'AND') the domains
   * coming from the active groups of type 'filter', 'dateFilter', 'favorite', and 'field'.
   */
  getDomain() {
    const groups = this.getGroups();
    const groupDomains = [];
    for (const group of groups) {
      const groupActiveItemDomains = [];
      for (const activeItem of group.activeItems) {
        const domain = this.getSearchItemDomain(activeItem);
        if (domain) {
          groupActiveItemDomains.push(domain);
        }
      }
      const groupDomain = combineDomains(groupActiveItemDomains, "OR");
      groupDomains.push(groupDomain);
    }
    try {
      return combineDomains(groupDomains, "AND");
    } catch (err) {
      throw new Error(`${this.env._t("Failed to evaluate domain")}:/n${JSON.stringify(err)}`);
    }
  }
  /**
   * Return the domain of the provided filter.
   */
  getSearchItemDomain(activeItem) {
    const { searchItemId } = activeItem;
    const searchItem = this.searchItems[searchItemId];
    switch (searchItem.type) {
      case "field":
        return this.getFieldDomain(searchItem, activeItem.autocompletValues);
      case "dateFilter":
        const { dateFilterId } = this.getActiveComparison() || {};
        if (this.searchMenuTypes.has("comparison") && dateFilterId === searchItemId) {
          return new Domain([]);
        }
        return this.getDateFilterDomain(searchItem, activeItem.generatorIds);
      case "filter":
      case "favorite":
        return searchItem.domain;
      default:
        return null;
    }
  }
  /**
   * Compute the string representation or the description of the current domain associated
   * with a date filter starting from its corresponding query elements.
   */
  getDateFilterDomain(dateFilter, generatorIds, key = "domain") {
    const { fieldName, fieldType } = dateFilter;
    const { direction } = this._localizationService;
    const dateFilterRange = constructDateDomain(
      this.referenceMoment,
      fieldName,
      fieldType,
      generatorIds,
      direction
    );
    return dateFilterRange[key];
  }
  /**
   * Return the domain resulting from the combination of the autocomplete values
   * of a search item of type 'field'.
   */
  getFieldDomain(field, autocompleteValues) {
    const domains = autocompleteValues.map(({ label, value, operator }) => {
      let domain;
      if (field.filterDomain) {
        domain = field.filterDomain.toList({ self: label, raw_value: value });
      } else {
        domain = [[field.fieldName, operator, value]];
      }
      return new Domain(domain);
    });
    return combineDomains(domains, "OR");
  }
  getFacets() {
    const facets = [];
    const groups = this.getGroups();
    for (const group of groups) {
      const values = [];
      let title;
      let type;
      for (const activeItem of group.activeItems) {
        const searchItem = this.searchItems[activeItem.searchItemId];
        switch (searchItem.type) {
          case "field":
            type = "field";
            title = searchItem.description;
            for (const autocompleteValue of activeItem.autocompletValues) {
              values.push(autocompleteValue.label);
            }
            break;
          case "groupBy":
            type = "groupBy";
            values.push(searchItem.description);
            break;
          case "dateGroupBy":
            type = "groupBy";
            for (const intervalId of activeItem.intervalIds) {
              const option = this.intervalOptions.find((o) => o.id === intervalId);
              values.push(`${searchItem.description}:${option.description}`);
            }
            break;
          case "dateFilter":
            type = "filter";
            const periodDescription = this.getDateFilterDomain(
              searchItem,
              activeItem.generatorIds,
              "description"
            );
            values.push(`${searchItem.description}: ${periodDescription}`);
            break;
          default:
            type = searchItem.type;
            values.push(searchItem.description);
        }
      }
      const facet = {
        groupId: group.id,
        type: type,
        values,
        separator: type === "groupBy" ? ">" : this.env._t("or"),
      };
      if (type === "field") {
        facet.title = title;
      } else {
        facet.icon = FACET_ICONS[type];
      }
      facets.push(facet);
    }
    return facets;
  }
  /**
   * Return the concatenation of groupBys comming from the active filters of
   * type 'favorite' and 'groupBy'.
   * The result respects the appropriate logic: the groupBys
   * coming from an active favorite (if any) come first, then come the
   * groupBys comming from the active filters of type 'groupBy' in the order
   * defined in this.query. If no groupBys are found, one tries to
   * find some grouBys in this.globalContext.
   */
  getGroupBy() {
    const groups = this.getGroups();
    const groupBys = [];
    for (const group of groups) {
      for (const activeItem of group.activeItems) {
        const activeItemGroupBys = this.getSearchItemGroupBys(activeItem);
        if (activeItemGroupBys) {
          groupBys.push(...activeItemGroupBys);
        }
      }
    }
    const groupBy = groupBys.length ? groupBys : this.globalContext.group_by || []; // globalContext.group_by camelcased???
    return typeof groupBy === "string" ? [groupBy] : groupBy;
  }
  getSearchItemGroupBys(activeItem) {
    const { searchItemId } = activeItem;
    const searchItem = this.searchItems[searchItemId];
    switch (searchItem.type) {
      case "dateGroupBy":
        const { fieldName } = searchItem;
        return activeItem.intervalIds.map((intervalId) => getGroupBy(`${fieldName}:${intervalId}`));
      case "groupBy":
        return [getGroupBy(searchItem.fieldName)];
      case "favorite":
        return searchItem.groupBys;
      default:
        return null;
    }
  }
  /**
   * @returns {string[]}
   */
  getOrderedBy() {
    const groups = this.getGroups();
    const orderedBy = [];
    for (const group of groups) {
      for (const activeItem of group.activeItems) {
        const { searchItemId } = activeItem;
        const searchItem = this.searchItems[searchItemId];
        if (searchItem.type === "favorite") {
          orderedBy.push(...searchItem.orderedBy);
        }
      }
    }
    return orderedBy;
  }
  /**
   * Reconstruct the (active) groups from the query elements.
   * @private
   * @returns {Object[]}
   */
  getGroups() {
    const preGroups = [];
    for (const queryElem of this.query) {
      const { searchItemId } = queryElem;
      const { groupId } = this.searchItems[searchItemId];
      let preGroup = preGroups.find((group) => group.id === groupId);
      if (!preGroup) {
        preGroup = { id: groupId, queryElements: [] };
        preGroups.push(preGroup);
      }
      preGroup.queryElements.push(queryElem);
    }
    const groups = [];
    for (const preGroup of preGroups) {
      const { queryElements, id } = preGroup;
      let activeItems = [];
      for (const queryElem of queryElements) {
        const { searchItemId } = queryElem;
        let activeItem = activeItems.find(({ searchItemId: id }) => id === searchItemId);
        if ("generatorId" in queryElem) {
          if (!activeItem) {
            activeItem = { searchItemId, generatorIds: [] };
            activeItems.push(activeItem);
          }
          activeItem.generatorIds.push(queryElem.generatorId);
        } else if ("intervalId" in queryElem) {
          if (!activeItem) {
            activeItem = { searchItemId, intervalIds: [] };
            activeItems.push(activeItem);
          }
          activeItem.intervalIds.push(queryElem.intervalId);
        } else if ("autocompleteValue" in queryElem) {
          if (!activeItem) {
            activeItem = { searchItemId, autocompletValues: [] };
            activeItems.push(activeItem);
          }
          activeItem.autocompletValues.push(queryElem.autocompleteValue);
        } else {
          if (!activeItem) {
            activeItem = { searchItemId };
            activeItems.push(activeItem);
          }
        }
      }
      for (const activeItem of activeItems) {
        if ("intervalIds" in activeItem) {
          activeItem.intervalIds.sort((g1, g2) => rankInterval(g1) - rankInterval(g2));
        }
      }
      groups.push({ id, activeItems });
    }
    return groups;
  }
  irFilterToFavorite(irFilter) {
    let userId = false;
    if (Array.isArray(irFilter.user_id)) {
      userId = irFilter.user_id[0];
    }
    const groupNumber = userId ? FAVORITE_PRIVATE_GROUP : FAVORITE_SHARED_GROUP;
    const context = evaluateExpr(irFilter.context, this._userService.context);
    let groupBys = [];
    if (context.group_by) {
      groupBys = context.group_by.map((str) => getGroupBy(str));
      delete context.group_by;
    }
    let comparison;
    if (context.comparison) {
      comparison = context.comparison;
      if (typeof comparison.range === "string") {
        // legacy case
        comparison.range = new Domain(comparison.range).toList();
      }
      if (typeof comparison.comparisonRange === "string") {
        // legacy case
        comparison.comparisonRange = new Domain(comparison.comparisonRange).toList();
      }
      delete context.comparison;
    }
    let sort;
    try {
      sort = JSON.parse(irFilter.sort);
    } catch (err) {
      if (err instanceof SyntaxError) {
        sort = [];
      } else {
        throw err;
      }
    }
    const orderedBy = sort.map((order) => {
      let fieldName;
      let asc;
      const sqlNotation = order.split(" ");
      if (sqlNotation.length > 1) {
        // regex: \fieldName (asc|desc)?\
        fieldName = sqlNotation[0];
        asc = sqlNotation[1] === "asc";
      } else {
        // legacy notation -- regex: \-?fieldName\
        fieldName = order[0] === "-" ? order.slice(1) : order;
        asc = order[0] === "-" ? false : true;
      }
      return {
        asc: asc,
        name: fieldName,
      };
    });
    const favorite = {
      context,
      description: irFilter.name,
      domain: new Domain(irFilter.domain),
      groupBys,
      groupNumber,
      orderedBy,
      removable: true,
      serverSideId: irFilter.id,
      type: "favorite",
      userId,
    };
    if (irFilter.is_default) {
      favorite.isDefault = irFilter.is_default;
    }
    if (comparison) {
      favorite.comparison = comparison;
    }
    return favorite;
  }
  getComparison() {
    let searchItem = null;
    for (const queryElem of this.query.slice().reverse()) {
      const item = this.searchItems[queryElem.searchItemId];
      if (item.type === "comparison") {
        searchItem = item;
        break;
      } else if (item.type === "favorite" && item.comparison) {
        searchItem = item;
        break;
      }
    }
    if (!searchItem) {
      return null;
    } else if (searchItem.type === "favorite") {
      return searchItem.comparison;
    }
    const { dateFilterId, comparisonOptionId } = searchItem;
    const { fieldName, fieldType, description: dateFilterDescription } = this.searchItems[
      dateFilterId
    ];
    const selectedGeneratorIds = this.getSelectedGeneratorIds(dateFilterId);
    const direction = this._localizationService.direction;
    // compute range and range description
    const { domain: range, description: rangeDescription } = constructDateDomain(
      this.referenceMoment,
      fieldName,
      fieldType,
      selectedGeneratorIds,
      direction
    );
    // compute comparisonRange and comparisonRange description
    const {
      domain: comparisonRange,
      description: comparisonRangeDescription,
    } = constructDateDomain(
      this.referenceMoment,
      fieldName,
      fieldType,
      selectedGeneratorIds,
      direction,
      comparisonOptionId
    );
    return {
      comparisonId: comparisonOptionId,
      fieldName,
      fieldDescription: dateFilterDescription,
      range: range.toList(),
      rangeDescription,
      comparisonRange: comparisonRange.toList(),
      comparisonRangeDescription,
    };
  }
}
