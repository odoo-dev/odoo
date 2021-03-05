/** @odoo-module **/

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
import { evaluateExpr } from "../../py_js/py";
import { useService } from "../../core/hooks";
import { Model } from "../view_utils/model";

const { useComponent } = owl.hooks;

const { DateTime } = luxon;

//--------------------------------------------------------------------------
// Global constants/variables
//--------------------------------------------------------------------------

const FAVORITE_PRIVATE_GROUP = 1;
const FAVORITE_SHARED_GROUP = 2;
const DISABLE_FAVORITE = "search_disable_custom_filters";

let nextId = 1;
let nextGroupId = 1;
let nextGroupNumber = 1;

export class SearchModel extends Model {
  setup() {
    // env
    const component = useComponent();
    this.env = component.env;

    // services
    this._localizationService = useService("localization");
    this._modelService = useService("model");
    this._userService = useService("user");

    // used to manage search items related to date/datetime fields
    this.referenceMoment = DateTime.local();
    this.comparisonOptions = getComparisonOptions();
    this.intervalOptions = getIntervalOptions();
    this.optionGenerators = getPeriodOptions(this.referenceMoment);
  }

  async load(config) {
    this.blockNotification = true;

    // normalized state
    this.searchItems = {};
    this.query = [];

    this.domainParts = {};

    // used to avoid useless recomputations
    this._context = null;
    this._groupBy = null;
    this._domain = null;
    this._domains = null;
    this._orderBy = null;

    // read config
    this.searchMenuTypes = new Set(config.searchMenuTypes || ["filter", "groupBy", "favorite"]);
    this.onSaveParams = config.onSaveParams;

    const { context, domain, dynamicFilters, groupBy, model, orderBy } = config;
    const { irFilters, fields, preSearchItems } = config.processedSearchViewDescription || {};
    if (!model) {
      throw Error(`SearchPanel config should have a "model" key`);
    }
    this.modelName = model;

    this.fields = fields || {};

    this.globalContext = context || {};
    this.globalDomain = new Domain(domain || []);
    this.globalGroupBy = (groupBy || this.globalContext.group_by || []).map((gb) =>
      getGroupBy(gb, fields)
    ); // change API --> class GroupBy taking string or string[] in constructor
    this.globalOrderBy = orderBy || [];

    // prepare search items (populate this.searchItems)
    const defaultFavoriteId = this.createGroupOfFavorites(irFilters || []);
    const activateFavorite =
      DISABLE_FAVORITE in this.globalContext ? this.globalContext[DISABLE_FAVORITE] : true;
    this.defaultFavoriteId = activateFavorite ? defaultFavoriteId : null;

    for (const preGroup of preSearchItems || []) {
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
    if (dynamicFilters) {
      console.warn(
        this.env._t(
          `The key "dynamicFilters" is deprecated: use "preSearchItems" key in a suitable way`
        )
      );
      this.createGroupOfDynamicFilters(dynamicFilters);
    }

    // activate default search items (populate this.query)
    this.activateDefaultFilters();

    this.blockNotification = false;
  }

  //--------------------------------------------------------------------------
  // Getters
  //--------------------------------------------------------------------------

  get context() {
    if (!this._context) {
      this._context = makeContext(this.globalContext, this.getContext());
    }
    return this._context;
  }

  get domain() {
    if (!this._domain) {
      this._domain = combineDomains([this.globalDomain, this.getDomain()], "AND").toList(
        this._userService.context
      );
    }
    return this._domain;
  }

  get domains() {
    if (!this._domains) {
      const comparison = this.getComparison();
      if (comparison) {
        const {
          fieldName,
          range,
          rangeDescription,
          comparisonRange,
          comparisonRangeDescription,
        } = comparison;
        this._domains = [
          {
            arrayRepr: combineDomains([this.domain, range], "AND").toList(),
            description: rangeDescription,
          },
          {
            arrayRepr: combineDomains([this.domain, comparisonRange], "AND").toList(),
            description: comparisonRangeDescription,
          },
        ];
        this._domains.fieldName = fieldName; // bad but for now okay
      } else {
        this._domains = [{ arrayRepr: this.domain, description: null }];
      }
    }
    return this._domains;
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

  get groupBy() {
    if (!this._groupBy) {
      this._groupBy = this.getGroupBy();
    }
    return this._groupBy;
  }

  get orderBy() {
    if (!this._orderBy) {
      this._orderBy = this.getOrderBy();
    }
    return this._orderBy;
  }

  get searchQuery() {
    return {
      context: this.context,
      domain: this.domain,
      domains: this.domains,
      groupBy: this.groupBy,
      orderBy: this.orderBy,
    };
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

  getDomainParts() {
    return JSON.parse(JSON.stringify(this.domainParts));
  }

  setDomainParts(parts) {
    for (const key in parts) {
      const val = parts[key];
      if (!val) {
        delete this.domainParts[key];
      } else {
        this.domainParts[key] = val;
        // val of the form { domain: ArrayRepr, facet: Object | null }
      }
    }
    this.notify();
    // this affect search panel content and maybe search bar (when facet is defined)
  }

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
    const orderBy = controllerQueryParams.orderBy
      ? controllerQueryParams.orderBy
      : this.getOrderBy() || [];
    const userId = isShared ? false : this._userService.userId;
    const serverSideId = await this._modelService("ir.filters").call("create_or_replace", [
      {
        name: description,
        action_id: this.actionId,
        model_id: this.modelName,
        domain: domain.toString(),
        is_default: isDefault,
        sort: JSON.stringify(orderBy.map((o) => `${o.name}${o.asc === false ? " desc" : ""}`)),
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
      orderBy,
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

  //--------------------------------------------------------------------------
  // Private methods
  //--------------------------------------------------------------------------

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

    const extraDomains = [];
    for (const { domain } of Object.values(this.domainParts)) {
      extraDomains.push(domain);
    }
    groupDomains.push(...extraDomains);
    // we need to manage (optional) facets, deactivateGroup, clearQuery,...

    try {
      return combineDomains(groupDomains, "AND");
    } catch (err) {
      throw new Error(`${this.env._t("Failed to evaluate domain")}:/n${JSON.stringify(err)}`);
    }
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
    const groupBy = groupBys.length ? groupBys : this.globalGroupBy; // globalContext.group_by camelcased???
    return typeof groupBy === "string" ? [groupBy] : groupBy;
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

  /**
   * @returns {string[]}
   */
  getOrderBy() {
    const groups = this.getGroups();
    let orderBy = [];
    for (const group of groups) {
      for (const activeItem of group.activeItems) {
        const { searchItemId } = activeItem;
        const searchItem = this.searchItems[searchItemId];
        if (searchItem.type === "favorite") {
          orderBy.push(...searchItem.orderBy);
        }
      }
    }
    orderBy = orderBy.length ? orderBy : this.globalOrderBy;
    return typeof orderBy === "string" ? [orderBy] : orderBy;
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
    const orderBy = sort.map((order) => {
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
      orderBy,
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

  notify() {
    if (this.blockNotification) {
      return;
    }
    this._context = null;
    this._domain = null;
    this._domains = null;
    this._groupBy = null;
    this._orderBy = null;
    this.trigger("update");
  }

  //   constructor() {
  //     super(...arguments);

  //     this.categoriesToLoad = [];
  //     this.defaultValues = {};
  //     this.filtersToLoad = [];
  //     this.initialStateImport = false;
  //     this.searchDomain = [];
  //     for (const key in this.config.context) {
  //         const match = /^searchpanel_default_(.*)$/.exec(key);
  //         if (match) {
  //             this.defaultValues[match[1]] = this.config.context[key];
  //         }
  //     }
  // }

  //---------------------------------------------------------------------
  // Public
  //---------------------------------------------------------------------

  /**
   * @override
   */
  async callLoad(params) {
    const searchDomain = this._getExternalDomain();
    params.searchDomainChanged = JSON.stringify(this.searchDomain) !== JSON.stringify(searchDomain);
    if (!this.shouldLoad && !this.initialStateImport) {
      const isFetchable = (section) =>
        section.enableCounters || (params.searchDomainChanged && !section.expand);
      this.categoriesToLoad = this.categories.filter(isFetchable);
      this.filtersToLoad = this.filters.filter(isFetchable);
      this.shouldLoad =
        params.searchDomainChanged ||
        Boolean(this.categoriesToLoad.length + this.filtersToLoad.length);
    }
    this.searchDomain = searchDomain;
    this.initialStateImport = false;
    await super.callLoad(params);
  }

  // /**
  //  * @override
  //  */
  // async isReady() {
  //     await this.sectionsPromise;
  // }

  // /**
  //  * @override
  //  */
  // async load(params) {
  //     this.sectionsPromise = this._fetchSections(params.isInitialLoad);
  //     if (this._shouldWaitForData(params)) {
  //         await this.sectionsPromise;
  //     }
  // }

  /**
   * @override
   */
  prepareState() {
    Object.assign(this.state, { sections: new Map() });
    this._createSectionsFromArch();
  }

  //---------------------------------------------------------------------
  // Actions / Getters
  //---------------------------------------------------------------------

  // /**
  //  * Returns the concatenation of the category domain ad the filter
  //  * domain.
  //  * @returns {Array[]}
  //  */
  // getDomain() {
  //     return Domain.prototype.normalizeArray([
  //         ...this._getCategoryDomain(),
  //         ...this._getFilterDomain(),
  //     ]);
  // }

  /**
   * Returns a sorted list of a copy of all sections. This list can be
   * filtered by a given predicate.
   * @param {sectionPredicate} [predicate] used to determine
   *      which subsets of sections is wanted
   * @returns {Section[]}
   */
  getSections(predicate) {
    let sections = [...this.state.sections.values()].map((section) =>
      Object.assign({}, section, { empty: !hasValues(section) })
    );
    if (predicate) {
      sections = sections.filter(predicate);
    }
    return sections.sort((s1, s2) => s1.index - s2.index);
  }

  /**
   * Sets the active value id of a given category.
   * @param {number} sectionId
   * @param {number} valueId
   */
  toggleCategoryValue(sectionId, valueId) {
    const category = this.state.sections.get(sectionId);
    category.activeValueId = valueId;
  }

  /**
   * Toggles a the filter value of a given section. The value will be set
   * to "forceTo" if provided, else it will be its own opposed value.
   * @param {number} sectionId
   * @param {number[]} valueIds
   * @param {boolean} [forceTo=null]
   */
  toggleFilterValues(sectionId, valueIds, forceTo = null) {
    const section = this.state.sections.get(sectionId);
    for (const valueId of valueIds) {
      const value = section.values.get(valueId);
      value.checked = forceTo === null ? !value.checked : forceTo;
    }
  }

  //---------------------------------------------------------------------
  // Internal getters
  //---------------------------------------------------------------------

  /**
   * Shorthand access to sections of type "category".
   * @returns {Category[]}
   */
  get categories() {
    return [...this.state.sections.values()].filter((s) => s.type === "category");
  }

  /**
   * Shorthand access to sections of type "filter".
   * @returns {Filter[]}
   */
  get filters() {
    return [...this.state.sections.values()].filter((s) => s.type === "filter");
  }

  //---------------------------------------------------------------------
  // Private
  //---------------------------------------------------------------------

  /**
   * Sets active values for each filter (coming from context). This needs
   * to be done only once at initialization.
   * @private
   */
  _applyDefaultFilterValues() {
    for (const { fieldName, values } of this.filters) {
      const defaultValues = this.defaultValues[fieldName] || [];
      for (const valueId of defaultValues) {
        const value = values.get(valueId);
        if (value) {
          value.checked = true;
        }
      }
    }
  }

  /**
   * @private
   * @param {string} sectionId
   * @param {Object} result
   */
  _createCategoryTree(sectionId, result) {
    const category = this.state.sections.get(sectionId);

    let { error_msg, parent_field: parentField, values } = result;
    if (error_msg) {
      category.errorMsg = error_msg;
      values = [];
    }
    if (category.hierarchize) {
      category.parentField = parentField;
    }
    for (const value of values) {
      category.values.set(
        value.id,
        Object.assign({}, value, {
          childrenIds: [],
          parentId: value[parentField] || false,
        })
      );
    }
    for (const value of values) {
      const { parentId } = category.values.get(value.id);
      if (parentId && category.values.has(parentId)) {
        category.values.get(parentId).childrenIds.push(value.id);
      }
    }
    // collect rootIds
    category.rootIds = [false];
    for (const value of values) {
      const { parentId } = category.values.get(value.id);
      if (!parentId) {
        category.rootIds.push(value.id);
      }
    }
    // Set active value from context
    const valueIds = [false, ...values.map((val) => val.id)];
    this._ensureCategoryValue(category, valueIds);
  }

  /**
   * @private
   * @param {string} sectionId
   * @param {Object} result
   */
  _createFilterTree(sectionId, result) {
    const filter = this.state.sections.get(sectionId);

    let { error_msg, values } = result;
    if (error_msg) {
      filter.errorMsg = error_msg;
      values = [];
    }

    // restore checked property
    values.forEach((value) => {
      const oldValue = filter.values.get(value.id);
      value.checked = oldValue ? oldValue.checked : false;
    });

    filter.values = new Map();
    const groupIds = [];
    if (filter.groupBy) {
      const groups = new Map();
      for (const value of values) {
        const groupId = value.group_id;
        if (!groups.has(groupId)) {
          if (groupId) {
            groupIds.push(groupId);
          }
          groups.set(groupId, {
            id: groupId,
            name: value.group_name,
            values: new Map(),
            tooltip: value.group_tooltip,
            sequence: value.group_sequence,
            hex_color: value.group_hex_color,
          });
          // restore former checked state
          const oldGroup = filter.groups && filter.groups.get(groupId);
          groups.get(groupId).state = (oldGroup && oldGroup.state) || false;
        }
        groups.get(groupId).values.set(value.id, value);
      }
      filter.groups = groups;
      filter.sortedGroupIds = sortBy(
        groupIds,
        (id) => groups.get(id).sequence || groups.get(id).name
      );
      for (const group of filter.groups.values()) {
        for (const [valueId, value] of group.values) {
          filter.values.set(valueId, value);
        }
      }
    } else {
      for (const value of values) {
        filter.values.set(value.id, value);
      }
    }
  }

  /**
   * Ensures that the active value of a category is one of its own
   * existing values.
   * @private
   * @param {Category} category
   * @param {number[]} valueIds
   */
  _ensureCategoryValue(category, valueIds) {
    if (!valueIds.includes(category.activeValueId)) {
      category.activeValueId = valueIds[0];
    }
  }

  /**
   * Fetches values for each category at startup. At reload a category is
   * only fetched if needed.
   * @private
   * @param {Category[]} categories
   * @returns {Promise} resolved when all categories have been fetched
   */
  async _fetchCategories(categories) {
    const filterDomain = this._getFilterDomain();
    await Promise.all(
      categories.map(async (category) => {
        const result = await this.env.services.rpc({
          method: "search_panel_select_range",
          model: this.config.modelName,
          args: [category.fieldName],
          kwargs: {
            category_domain: this._getCategoryDomain(category.id),
            enable_counters: category.enableCounters,
            expand: category.expand,
            filter_domain: filterDomain,
            hierarchize: category.hierarchize,
            limit: category.limit,
            search_domain: this.searchDomain,
          },
        });
        this._createCategoryTree(category.id, result);
      })
    );
  }

  /**
   * Fetches values for each filter. This is done at startup and at each
   * reload if needed.
   * @private
   * @param {Filter[]} filters
   * @returns {Promise} resolved when all filters have been fetched
   */
  async _fetchFilters(filters) {
    const evalContext = {};
    for (const category of this.categories) {
      evalContext[category.fieldName] = category.activeValueId;
    }
    const categoryDomain = this._getCategoryDomain();
    await Promise.all(
      filters.map(async (filter) => {
        const result = await this.env.services.rpc({
          method: "search_panel_select_multi_range",
          model: this.config.modelName,
          args: [filter.fieldName],
          kwargs: {
            category_domain: categoryDomain,
            comodel_domain: Domain.prototype.stringToArray(filter.domain, evalContext),
            enable_counters: filter.enableCounters,
            filter_domain: this._getFilterDomain(filter.id),
            expand: filter.expand,
            group_by: filter.groupBy || false,
            group_domain: this._getGroupDomain(filter),
            limit: filter.limit,
            search_domain: this.searchDomain,
          },
        });
        this._createFilterTree(filter.id, result);
      })
    );
  }

  /**
   * @private
   * @param {boolean} isInitialLoad
   * @returns {Promise}
   */
  async _fetchSections(isInitialLoad) {
    await this._fetchCategories(isInitialLoad ? this.categories : this.categoriesToLoad);
    await this._fetchFilters(isInitialLoad ? this.filters : this.filtersToLoad);
    if (isInitialLoad) {
      this._applyDefaultFilterValues();
    }
  }

  /**
   * Computes and returns the domain based on the current active
   * categories. If "excludedCategoryId" is provided, the category with
   * that id is not taken into account in the domain computation.
   * @private
   * @param {string} [excludedCategoryId]
   * @returns {Array[]}
   */
  _getCategoryDomain(excludedCategoryId) {
    const domain = [];
    for (const category of this.categories) {
      if (category.id === excludedCategoryId || !category.activeValueId) {
        continue;
      }
      const field = this.config.fields[category.fieldName];
      const operator = field.type === "many2one" && category.parentField ? "child_of" : "=";
      domain.push([category.fieldName, operator, category.activeValueId]);
    }
    return domain;
  }

  /**
   * Returns the domain retrieved from the other model extensions.
   * @private
   * @returns {Array[]}
   */
  _getExternalDomain() {
    const domains = this.config.get("domain");
    const domain = domains.reduce((acc, dom) => [...acc, ...dom], []);
    return Domain.prototype.normalizeArray(domain);
  }

  /**
   * Computes and returns the domain based on the current checked
   * filters. The values of a single filter are combined using a simple
   * rule: checked values within a same group are combined with an "OR"
   * operator (this is expressed as single condition using a list) and
   * groups are combined with an "AND" operator (expressed by
   * concatenation of conditions).
   * If a filter has no group, its checked values are implicitely
   * considered as forming a group (and grouped using an "OR").
   * If excludedFilterId is provided, the filter with that id is not
   * taken into account in the domain computation.
   * @private
   * @param {string} [excludedFilterId]
   * @returns {Array[]}
   */
  _getFilterDomain(excludedFilterId) {
    const domain = [];

    function addCondition(fieldName, valueMap) {
      const ids = [];
      for (const [valueId, value] of valueMap) {
        if (value.checked) {
          ids.push(valueId);
        }
      }
      if (ids.length) {
        domain.push([fieldName, "in", ids]);
      }
    }

    for (const filter of this.filters) {
      if (filter.id === excludedFilterId) {
        continue;
      }
      const { fieldName, groups, values } = filter;
      if (groups) {
        for (const group of groups.values()) {
          addCondition(fieldName, group.values);
        }
      } else {
        addCondition(fieldName, values);
      }
    }
    return domain;
  }

  /**
   * Returns a domain or an object of domains used to complement
   * the filter domains to accurately describe the constrains on
   * records when computing record counts associated to the filter
   * values (if a groupBy is provided). The idea is that the checked
   * values within a group should not impact the counts for the other
   * values in the same group.
   * @private
   * @param {string} filter
   * @returns {Object<string, Array[]> | Array[] | null}
   */
  _getGroupDomain(filter) {
    const { fieldName, groups, enableCounters } = filter;
    const { type: fieldType } = this.config.fields[fieldName];

    if (!enableCounters || !groups) {
      return {
        many2one: [],
        many2many: {},
      }[fieldType];
    }
    let groupDomain = null;
    if (fieldType === "many2one") {
      for (const group of groups.values()) {
        const valueIds = [];
        let active = false;
        for (const [valueId, value] of group.values) {
          const { checked } = value;
          valueIds.push(valueId);
          if (checked) {
            active = true;
          }
        }
        if (active) {
          if (groupDomain) {
            groupDomain = [[0, "=", 1]];
            break;
          } else {
            groupDomain = [[fieldName, "in", valueIds]];
          }
        }
      }
    } else if (fieldType === "many2many") {
      const checkedValueIds = new Map();
      groups.forEach(({ values }, groupId) => {
        values.forEach(({ checked }, valueId) => {
          if (checked) {
            if (!checkedValueIds.has(groupId)) {
              checkedValueIds.set(groupId, []);
            }
            checkedValueIds.get(groupId).push(valueId);
          }
        });
      });
      groupDomain = {};
      for (const [gId, ids] of checkedValueIds.entries()) {
        for (const groupId of groups.keys()) {
          if (gId !== groupId) {
            const key = JSON.stringify(groupId);
            if (!groupDomain[key]) {
              groupDomain[key] = [];
            }
            groupDomain[key].push([fieldName, "in", ids]);
          }
        }
      }
    }
    return groupDomain;
  }

  /**
   * Returns whether the query informations should be considered as ready
   * before or after having (re-)fetched the sections data.
   * @private
   * @param {Object} params
   * @param {boolean} params.isInitialLoad
   * @param {boolean} params.searchDomainChanged
   * @returns {boolean}
   */
  _shouldWaitForData({ isInitialLoad, searchDomainChanged }) {
    if (isInitialLoad && Object.keys(this.defaultValues).length) {
      // Default values need to be checked on initial load
      return true;
    }
    if (this.categories.length && this.filters.some(hasDomain)) {
      // Selected category value might affect the filter values
      return true;
    }
    if (!this.searchDomain.length) {
      // No search domain -> no need to check for expand
      return false;
    }
    return [...this.state.sections.values()].some(
      (section) => !section.expand && searchDomainChanged
    );
  }
}
