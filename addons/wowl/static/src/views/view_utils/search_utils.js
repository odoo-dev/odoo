/** @odoo-module **/
import { _lt } from "../../services/localization";
import { combineDomains, Domain } from "../../core/domain";
import { makeContext } from "../../core/context";
//-------------------------------------------------------------------------
// Constants
//-------------------------------------------------------------------------
export const FACET_ICONS = {
  filter: "fa fa-filter",
  groupBy: "fa fa-bars",
  favorite: "fa fa-star",
  comparison: "fa fa-adjust",
};
// FilterMenu parameters
export const FIELD_OPERATORS = {
  boolean: [
    { symbol: "=", description: _lt("is true"), value: true },
    { symbol: "!=", description: _lt("is false"), value: true },
  ],
  char: [
    { symbol: "ilike", description: _lt("contains") },
    { symbol: "not ilike", description: _lt("doesn't contain") },
    { symbol: "=", description: _lt("is equal to") },
    { symbol: "!=", description: _lt("is not equal to") },
    { symbol: "!=", description: _lt("is set"), value: false },
    { symbol: "=", description: _lt("is not set"), value: false },
  ],
  date: [
    { symbol: "=", description: _lt("is equal to") },
    { symbol: "!=", description: _lt("is not equal to") },
    { symbol: ">", description: _lt("is after") },
    { symbol: "<", description: _lt("is before") },
    { symbol: ">=", description: _lt("is after or equal to") },
    { symbol: "<=", description: _lt("is before or equal to") },
    { symbol: "between", description: _lt("is between") },
    { symbol: "!=", description: _lt("is set"), value: false },
    { symbol: "=", description: _lt("is not set"), value: false },
  ],
  datetime: [
    { symbol: "between", description: _lt("is between") },
    { symbol: "=", description: _lt("is equal to") },
    { symbol: "!=", description: _lt("is not equal to") },
    { symbol: ">", description: _lt("is after") },
    { symbol: "<", description: _lt("is before") },
    { symbol: ">=", description: _lt("is after or equal to") },
    { symbol: "<=", description: _lt("is before or equal to") },
    { symbol: "!=", description: _lt("is set"), value: false },
    { symbol: "=", description: _lt("is not set"), value: false },
  ],
  id: [{ symbol: "=", description: _lt("is") }],
  number: [
    { symbol: "=", description: _lt("is equal to") },
    { symbol: "!=", description: _lt("is not equal to") },
    { symbol: ">", description: _lt("greater than") },
    { symbol: "<", description: _lt("less than") },
    { symbol: ">=", description: _lt("greater than or equal to") },
    { symbol: "<=", description: _lt("less than or equal to") },
    { symbol: "!=", description: _lt("is set"), value: false },
    { symbol: "=", description: _lt("is not set"), value: false },
  ],
  selection: [
    { symbol: "=", description: _lt("is") },
    { symbol: "!=", description: _lt("is not") },
    { symbol: "!=", description: _lt("is set"), value: false },
    { symbol: "=", description: _lt("is not set"), value: false },
  ],
};
export const FIELD_TYPES = {
  boolean: "boolean",
  char: "char",
  date: "date",
  datetime: "datetime",
  float: "number",
  id: "id",
  integer: "number",
  html: "char",
  many2many: "char",
  many2one: "char",
  monetary: "number",
  one2many: "char",
  text: "char",
  selection: "selection",
};
export const DEFAULT_PERIOD = "this_month";
export const QUARTERS = {
  1: { description: _lt("Q1"), coveredMonths: [1, 2, 3] },
  2: { description: _lt("Q2"), coveredMonths: [4, 5, 6] },
  3: { description: _lt("Q3"), coveredMonths: [7, 8, 9] },
  4: { description: _lt("Q4"), coveredMonths: [10, 11, 12] },
};
export const MONTH_OPTIONS = {
  this_month: {
    id: "this_month",
    groupNumber: 1,
    format: "MMMM",
    plusParam: {},
    granularity: "month",
  },
  last_month: {
    id: "last_month",
    groupNumber: 1,
    format: "MMMM",
    plusParam: { months: -1 },
    granularity: "month",
  },
  antepenultimate_month: {
    id: "antepenultimate_month",
    groupNumber: 1,
    format: "MMMM",
    plusParam: { months: -2 },
    granularity: "month",
  },
};
export const QUARTER_OPTIONS = {
  fourth_quarter: {
    id: "fourth_quarter",
    groupNumber: 1,
    description: QUARTERS[4].description,
    setParam: { quarter: 4 },
    granularity: "quarter",
  },
  third_quarter: {
    id: "third_quarter",
    groupNumber: 1,
    description: QUARTERS[3].description,
    setParam: { quarter: 3 },
    granularity: "quarter",
  },
  second_quarter: {
    id: "second_quarter",
    groupNumber: 1,
    description: QUARTERS[2].description,
    setParam: { quarter: 2 },
    granularity: "quarter",
  },
  first_quarter: {
    id: "first_quarter",
    groupNumber: 1,
    description: QUARTERS[1].description,
    setParam: { quarter: 1 },
    granularity: "quarter",
  },
};
export const YEAR_OPTIONS = {
  this_year: {
    id: "this_year",
    groupNumber: 2,
    format: "yyyy",
    plusParam: {},
    granularity: "year",
  },
  last_year: {
    id: "last_year",
    groupNumber: 2,
    format: "yyyy",
    plusParam: { years: -1 },
    granularity: "year",
  },
  antepenultimate_year: {
    id: "antepenultimate_year",
    groupNumber: 2,
    format: "yyyy",
    plusParam: { years: -2 },
    granularity: "year",
  },
};
export const PERIOD_OPTIONS = Object.assign({}, MONTH_OPTIONS, QUARTER_OPTIONS, YEAR_OPTIONS);
// GroupByMenu parameters
export const GROUPABLE_TYPES = [
  "boolean",
  "char",
  "date",
  "datetime",
  "integer",
  "many2one",
  "selection",
];
export const DEFAULT_INTERVAL = "month";
export const INTERVAL_OPTIONS = {
  year: { description: _lt("Year"), id: "year", groupNumber: 1 },
  quarter: { description: _lt("Quarter"), id: "quarter", groupNumber: 1 },
  month: { description: _lt("Month"), id: "month", groupNumber: 1 },
  week: { description: _lt("Week"), id: "week", groupNumber: 1 },
  day: { description: _lt("Day"), id: "day", groupNumber: 1 },
};
// ComparisonMenu parameters
export const COMPARISON_OPTIONS = {
  previous_period: {
    description: _lt("Previous Period"),
    id: "previous_period",
  },
  previous_year: {
    description: _lt("Previous Year"),
    id: "previous_year",
    plusParam: { years: -1 },
  },
};
export const PER_YEAR = {
  year: 1,
  quarter: 4,
  month: 12,
};
//-------------------------------------------------------------------------
// Functions
//-------------------------------------------------------------------------
/**
 * Constructs the string representation of a domain and its description. The
 * domain is of the form:
 *      ['|',..., '|', d_1,..., d_n]
 * where d_i is a time range of the form
 *      ['&', [fieldName, >=, leftBound_i], [fieldName, <=, rightBound_i]]
 * where leftBound_i and rightBound_i are date or datetime computed accordingly
 * to the given options and reference moment.
 */
export function constructDateDomain(
  referenceMoment,
  fieldName,
  fieldType,
  selectedOptionIds,
  direction,
  comparisonOptionId
) {
  let plusParam;
  let selectedOptions;
  if (comparisonOptionId) {
    [plusParam, selectedOptions] = getComparisonParams(
      referenceMoment,
      selectedOptionIds,
      comparisonOptionId
    );
  } else {
    selectedOptions = getSelectedOptions(referenceMoment, selectedOptionIds);
  }
  const yearOptions = selectedOptions.year;
  const otherOptions = [...(selectedOptions.quarter || []), ...(selectedOptions.month || [])];
  sortPeriodOptions(yearOptions);
  sortPeriodOptions(otherOptions);
  const ranges = [];
  for (const yearOption of yearOptions) {
    const constructRangeParams = {
      referenceMoment,
      fieldName,
      fieldType,
      plusParam,
    };
    if (otherOptions.length) {
      for (const option of otherOptions) {
        const setParam = Object.assign({}, yearOption.setParam, option ? option.setParam : {});
        const { granularity } = option;
        const range = constructDateRange(
          Object.assign({ granularity, setParam, direction }, constructRangeParams)
        );
        ranges.push(range);
      }
    } else {
      const { granularity, setParam } = yearOption;
      const range = constructDateRange(
        Object.assign({ granularity, setParam, direction }, constructRangeParams)
      );
      ranges.push(range);
    }
  }
  const domain = combineDomains(
    ranges.map((range) => range.domain),
    "OR"
  );
  const description = ranges.map((range) => range.description).join("/");
  return { domain, description };
}
/**
 * Constructs the string representation of a domain and its description. The
 * domain is a time range of the form:
 *      ['&', [fieldName, >=, leftBound],[fieldName, <=, rightBound]]
 * where leftBound and rightBound are some date or datetime determined by setParam,
 * plusParam, granularity and the reference moment.
 */
export function constructDateRange(params) {
  const {
    referenceMoment,
    fieldName,
    fieldType,
    granularity,
    setParam,
    plusParam,
    direction,
  } = params;
  if ("quarter" in setParam) {
    // Luxon does not consider quarter key in setParam (like moment did)
    setParam.month = QUARTERS[setParam.quarter].coveredMonths[0];
    delete setParam.quarter;
  }
  const date = referenceMoment.set(setParam).plus(plusParam || {});
  // compute domain
  let leftDate = date.startOf(granularity);
  let rightDate = date.endOf(granularity);
  let leftBound;
  let rightBound;
  if (fieldType === "date") {
    leftBound = leftDate.toFormat("yyyy-MM-dd");
    rightBound = rightDate.toFormat("yyyy-MM-dd");
  } else {
    leftBound = leftDate.toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
    rightBound = rightDate.toUTC().toFormat("yyyy-MM-dd HH:mm:ss");
  }
  const domain = new Domain(["&", [fieldName, ">=", leftBound], [fieldName, "<=", rightBound]]);
  // compute description
  const descriptions = [date.toFormat("yyyy")];
  const method = direction === "rtl" ? "push" : "unshift";
  if (granularity === "month") {
    descriptions[method](date.toFormat("MMMM"));
  } else if (granularity === "quarter") {
    const quarter = date.quarter;
    descriptions[method](QUARTERS[quarter].description.toString());
  }
  const description = descriptions.join(" ");
  return { domain, description };
}
/**
 * Returns a version of the options in COMPARISON_OPTIONS with translated descriptions.
 * @see getOptionsWithDescriptions
 */
export function getComparisonOptions() {
  return getOptionsWithDescriptions(COMPARISON_OPTIONS);
}
/**
 * Returns the params plusParam and selectedOptions necessary for the computation
 * of a comparison domain.
 */
export function getComparisonParams(referenceMoment, selectedOptionIds, comparisonOptionId) {
  const comparisonOption = COMPARISON_OPTIONS[comparisonOptionId];
  const selectedOptions = getSelectedOptions(referenceMoment, selectedOptionIds);
  if (comparisonOption.plusParam) {
    return [comparisonOption.plusParam, selectedOptions];
  }
  let plusParam = {};
  let globalGranularity = "year";
  if (selectedOptions.month) {
    globalGranularity = "month";
  } else if (selectedOptions.quarter) {
    globalGranularity = "quarter";
  }
  const granularityFactor = PER_YEAR[globalGranularity];
  const years = selectedOptions.year.map((o) => o.setParam.year);
  const yearMin = Math.min(...years);
  const yearMax = Math.max(...years);
  let optionMin = 0;
  let optionMax = 0;
  if (selectedOptions.quarter) {
    const quarters = selectedOptions.quarter.map((o) => o.setParam.quarter);
    if (globalGranularity === "month") {
      delete selectedOptions.quarter;
      for (const quarter of quarters) {
        for (const month of QUARTERS[quarter].coveredMonths) {
          const monthOption = selectedOptions.month.find((o) => o.setParam.month === month);
          if (!monthOption) {
            selectedOptions.month.push({
              setParam: { month },
              granularity: "month",
            });
          }
        }
      }
    } else {
      optionMin = Math.min(...quarters);
      optionMax = Math.max(...quarters);
    }
  }
  if (selectedOptions.month) {
    const months = selectedOptions.month.map((o) => o.setParam.month);
    optionMin = Math.min(...months);
    optionMax = Math.max(...months);
  }
  const num = -1 + granularityFactor * (yearMin - yearMax) + optionMin - optionMax;
  const key =
    globalGranularity === "year" ? "years" : globalGranularity === "month" ? "months" : "quarters";
  plusParam[key] = num;
  return [plusParam, selectedOptions];
}
/**
 * Returns a version of the options in INTERVAL_OPTIONS with translated descriptions.
 * @see getOptionsWithDescriptions
 */
export function getIntervalOptions() {
  return getOptionsWithDescriptions(INTERVAL_OPTIONS);
}
/**
 * Returns a version of the options in PERIOD_OPTIONS with translated descriptions
 * and a key defautlYearId used in the control panel model when toggling a period option.
 */
export function getPeriodOptions(referenceMoment) {
  // adapt when solution for moment is found...
  const options = [];
  const originalOptions = Object.values(PERIOD_OPTIONS);
  for (const option of originalOptions) {
    const { id, groupNumber } = option;
    let description;
    let defaultYear;
    switch (option.granularity) {
      case "quarter":
        description = option.description.toString();
        defaultYear = referenceMoment.set(option.setParam).year;
        break;
      case "month":
      case "year":
        const date = referenceMoment.plus(option.plusParam);
        description = date.toFormat(option.format);
        defaultYear = date.year;
        break;
    }
    const setParam = getSetParam(option, referenceMoment);
    options.push({ id, groupNumber, description, defaultYear, setParam });
  }
  const periodOptions = [];
  for (const option of options) {
    const { id, groupNumber, description, defaultYear } = option;
    const yearOption = options.find((o) => o.setParam && o.setParam.year === defaultYear);
    periodOptions.push({
      id,
      groupNumber,
      description,
      defaultYearId: yearOption.id,
    });
  }
  return periodOptions;
}
/**
 * Returns a version of the options in OPTIONS with translated descriptions (if any).
 * @param {Object{}} OPTIONS
 * @returns {Object[]}
 */
export function getOptionsWithDescriptions(OPTIONS) {
  const options = [];
  for (const option of Object.values(OPTIONS)) {
    options.push(Object.assign({}, option, { description: option.description.toString() }));
  }
  return options;
}
/**
 * Returns a partial version of the period options whose ids are in selectedOptionIds
 * partitioned by granularity.
 */
export function getSelectedOptions(referenceMoment, selectedOptionIds) {
  const selectedOptions = { year: [] };
  for (const optionId of selectedOptionIds) {
    const option = PERIOD_OPTIONS[optionId];
    const setParam = getSetParam(option, referenceMoment);
    const granularity = option.granularity;
    if (!selectedOptions[granularity]) {
      selectedOptions[granularity] = [];
    }
    selectedOptions[granularity].push({ granularity, setParam });
  }
  return selectedOptions;
}
/**
 * Returns the setParam object associated with the given periodOption and
 * referenceMoment.
 */
export function getSetParam(periodOption, referenceMoment) {
  if (periodOption.granularity === "quarter") {
    return periodOption.setParam;
  }
  const date = referenceMoment.plus(periodOption.plusParam);
  const granularity = periodOption.granularity;
  const setParam = { [granularity]: date[granularity] };
  return setParam;
}
export function rankInterval(intervalOptionId) {
  return Object.keys(INTERVAL_OPTIONS).indexOf(intervalOptionId);
}
/**
 * Sorts in place an array of 'period' options.
 */
export function sortPeriodOptions(options) {
  options.sort((o1, o2) => {
    var _a, _b;
    const granularity1 = o1.granularity;
    const granularity2 = o2.granularity;
    if (granularity1 === granularity2) {
      return (
        ((_a = o1.setParam[granularity1]) !== null && _a !== void 0 ? _a : 0) -
        ((_b = o2.setParam[granularity1]) !== null && _b !== void 0 ? _b : 0)
      );
    }
    return granularity1 < granularity2 ? -1 : 1;
  });
}
/**
 * Checks if a year id is among the given array of period option ids.
 */
export function yearSelected(selectedOptionIds) {
  return selectedOptionIds.some((optionId) => Object.keys(YEAR_OPTIONS).includes(optionId));
}
export async function processSearchViewDescription(
  searchViewDescription,
  _modelService,
  searchDefaults = {}
) {
  const fields = searchViewDescription.fields || {};
  const irFilters = searchViewDescription.irFilters || [];
  const arch = searchViewDescription.arch || "<search/>";
  const parser = new DOMParser();
  const xml = parser.parseFromString(arch, "text/xml");
  const preSearchItems = [];
  const labelPromises = [];
  // we could avoid useless name_get if we consider this kink of stuff:
  //   const activateFavorite =
  //   DISABLE_FAVORITE in this.globalContext ? this.globalContext[DISABLE_FAVORITE] : true;
  // this.defaultFavoriteId = activateFavorite ? defaultFavoriteId : null;
  parseXML(xml.documentElement, {
    _modelService,
    currentGroup: [],
    currentTag: null,
    fields,
    groupNumber: 0,
    labelPromises,
    pregroupOfGroupBys: [],
    preSearchItems,
    searchDefaults,
  });
  await Promise.all(labelPromises);
  return { fields, irFilters, preSearchItems };
}
function pushGroup(data, tag = null) {
  if (data.currentGroup.length) {
    if (data.currentTag && ["groupBy", "dateGroupBy"].includes(data.currentTag)) {
      data.pregroupOfGroupBys.push(...data.currentGroup);
    } else {
      data.preSearchItems.push(data.currentGroup);
    }
  }
  data.currentTag = tag;
  data.currentGroup = [];
  data.groupNumber++;
}
function parseXML(node, data) {
  if (!(node instanceof Element)) {
    return;
  }
  if (node.nodeType === 1) {
    switch (node.tagName) {
      case "search":
        for (let child of node.childNodes) {
          parseXML(child, data);
        }
        pushGroup(data);
        if (data.pregroupOfGroupBys.length) {
          data.preSearchItems.push(data.pregroupOfGroupBys);
        }
        break;
      case "group":
        pushGroup(data);
        for (let child of node.childNodes) {
          parseXML(child, data);
        }
        pushGroup(data);
        break;
      case "separator":
        pushGroup(data);
        break;
      case "field":
        pushGroup(data, "field");
        const preField = { type: "field" };
        if (node.hasAttribute("modifiers")) {
          const modifiers = JSON.parse(node.getAttribute("modifiers"));
          if (modifiers.invisible) {
            preField.invisible = true;
          }
        }
        if (node.hasAttribute("domain")) {
          preField.domain = new Domain(node.getAttribute("domain"));
        }
        if (node.hasAttribute("filter_domain")) {
          preField.filterDomain = new Domain(node.getAttribute("filter_domain"));
        } else if (node.hasAttribute("operator")) {
          preField.operator = node.getAttribute("operator");
        }
        if (node.hasAttribute("context")) {
          preField.context = node.getAttribute("context");
        }
        if (node.hasAttribute("name")) {
          const name = node.getAttribute("name");
          preField.fieldName = name;
          preField.fieldType = data.fields[name].type;
          if (name in data.searchDefaults) {
            preField.isDefault = true;
            let value = data.searchDefaults[name];
            value = Array.isArray(value) ? value[0] : value;
            let operator = preField.operator;
            if (!operator) {
              let type = preField.fieldType;
              if (node.hasAttribute("widget")) {
                type = node.getAttribute("widget");
              }
              // Note: many2one as a default filter will have a
              // numeric value instead of a string => we want "="
              // instead of "ilike".
              if (["char", "html", "many2many", "one2many", "text"].includes(type)) {
                operator = "ilike";
              } else {
                operator = "=";
              }
            }
            preField.defaultRank = -10;
            const { fieldType, fieldName } = preField;
            const { selection, context, relation } = data.fields[fieldName];
            preField.defaultAutocompleteValue = { label: value, operator, value };
            if (fieldType === "selection") {
              const option = selection.find((sel) => sel[0] === value);
              if (!option) {
                throw Error();
              }
              preField.defaultAutocompleteValue.label = option[1];
            } else if (fieldType === "many2one") {
              const promise = data
                ._modelService(relation)
                .call("name_get", [value], { context })
                .then((results) => {
                  preField.defaultAutocompleteValue.label = results[0][1];
                });
              data.labelPromises.push(promise);
            }
          }
        } else {
          throw Error(); //but normally this should have caught earlier with view arch validation server side
        }
        if (node.hasAttribute("string")) {
          preField.description = node.getAttribute("string");
        } else if (preField.fieldName) {
          preField.description = data.fields[preField.fieldName].string;
        } else {
          preField.description = "Ω";
        }
        data.currentGroup.push(preField);
        break;
      case "filter":
        const preSearchItem = { type: "filter" };
        if (node.hasAttribute("context")) {
          const context = node.getAttribute("context");
          try {
            const groupBy = makeContext(context).group_by;
            if (groupBy) {
              preSearchItem.type = "groupBy";
              const [fieldName, defaultInterval] = makeContext(context).group_by.split(":");
              preSearchItem.fieldName = fieldName;
              preSearchItem.fieldType = data.fields[fieldName].type;
              if (["date", "datetime"].includes(preSearchItem.fieldType)) {
                preSearchItem.type = "dateGroupBy";
                preSearchItem.defaultIntervalId = defaultInterval || DEFAULT_INTERVAL;
              }
            }
          } catch (e) {}
          if (preSearchItem.type === "filter") {
            preSearchItem.context = context;
          }
        }
        if (preSearchItem.type !== data.currentTag) {
          pushGroup(data, preSearchItem.type);
        }
        if (preSearchItem.type === "filter") {
          if (node.hasAttribute("date")) {
            const fieldName = node.getAttribute("date");
            preSearchItem.type = "dateFilter";
            preSearchItem.fieldName = fieldName;
            preSearchItem.fieldType = data.fields[fieldName].type;
            preSearchItem.defaultGeneratorId = DEFAULT_PERIOD;
            if (node.hasAttribute("default_period")) {
              preSearchItem.defaultGeneratorId = node.getAttribute("default_period");
            }
          } else {
            let stringRepr = "[]";
            if (node.hasAttribute("domain")) {
              stringRepr = node.getAttribute("domain");
            }
            preSearchItem.domain = new Domain(stringRepr);
          }
        }
        if (node.hasAttribute("modifiers")) {
          const modifiers = JSON.parse(node.getAttribute("modifiers"));
          if (modifiers.invisible) {
            preSearchItem.invisible = true;
            let fieldName = preSearchItem.fieldName;
            if (fieldName && !data.fields[fieldName]) {
              // In some case when a field is limited to specific groups
              // on the model, we need to ensure to discard related filter
              // as it may still be present in the view (in 'invisible' state)
              return;
            }
          }
        }
        preSearchItem.groupNumber = data.groupNumber;
        if (node.hasAttribute("name")) {
          const name = node.getAttribute("name");
          if (name in data.searchDefaults) {
            preSearchItem.isDefault = true;
            if (["groupBy", "dateGroupBy"].includes(preSearchItem.type)) {
              const value = data.searchDefaults[name];
              preSearchItem.defaultRank = typeof value === "number" ? value : 100;
            } else {
              preSearchItem.defaultRank = -5;
            }
          }
        }
        if (node.hasAttribute("string")) {
          preSearchItem.description = node.getAttribute("string");
        } else if (preSearchItem.fieldName) {
          preSearchItem.description = data.fields[preSearchItem.fieldName].string;
        } else if (node.hasAttribute("help")) {
          preSearchItem.description = node.getAttribute("help");
        } else if (node.getAttribute("name")) {
          preSearchItem.description = node.getAttribute("name");
        } else {
          preSearchItem.description = "Ω";
        }
        data.currentGroup.push(preSearchItem);
        break;
    }
  }
}
