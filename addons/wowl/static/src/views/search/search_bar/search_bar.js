/** @odoo-module **/
const { Component, hooks } = owl;
import { useService } from "../../../core/hooks";
const CHAR_FIELDS = ["char", "html", "many2many", "many2one", "one2many", "text"];
const { useExternalListener, useRef, useState } = hooks;
let nextSourceId = 0;
/**
 * Search bar
 *
 * This component has two main roles:
 * 1) Display the current search facets
 * 2) Create new search filters using an input and an autocompletion values
 *    generator.
 *
 * For the first bit, the core logic can be found in the XML template of this
 * component, searchfacet components or in the ControlPanelModel itself.
 *
 * The autocompletion mechanic works with transient subobjects called 'sources'.
 * Sources contain the information that will be used to generate new search facets.
 * A source is generated either:
 * a. From an undetermined user input: the user will give a string and select
 *    a field from the autocompletion dropdown > this will search the selected
 *    field records with the given pattern (with an 'ilike' operator);
 * b. From a given selection: when given an input by the user, the searchbar
 *    will pre-fetch 'many2one' field records matching the input value and filter
 *    'select'
 *  with the same value. If the user clicks on one of these
 *    fetched/filtered values, it will generate a matching search facet targeting
 *    records having this exact value.
 * @extends Component
 */
export class SearchBar extends Component {
  constructor() {
    super(...arguments);
    this.noResultItem = [null, this.env._t("(no result)")];
    this.state = useState({
      sources: [],
      focusedItem: 0,
      inputValue: "",
    });
    this.inputRef = useRef("search-input");
    this.model = useService("model");
    // this.focusOnUpdate = useAutofocus();
    this.autoCompleteSources = this.props.searchModel
      .getSearchItems((f) => f.type === "field")
      .map((filter) => this._createSource(filter));
    useExternalListener(window, "click", this._onWindowClick);
    useExternalListener(window, "keydown", this._onWindowKeydown);
  }
  mounted() {
    this.props.searchModel.on("update", this, this.render);
    // 'search' will always patch the search bar, 'focus' will never.
    // this.props.searchModel.on('search', this, this.focusOnUpdate);
    // this.props.searchModel.on('focus-control-panel', this, () => {
    //     this.inputRef.el.focus();
    // });
  }
  willUnmount() {
    this.props.searchModel.off("update", this);
    // this.props.searchModel.off('search', this);
    // this.props.searchModel.off('focus-control-panel', this);
  }
  //---------------------------------------------------------------------
  // Private
  //---------------------------------------------------------------------
  /**
   * @private
   */
  _closeAutoComplete() {
    this.state.sources = [];
    this.state.focusedItem = 0;
    this.state.inputValue = "";
    this.inputRef.el.value = "";
    // this.focusOnUpdate();
  }
  /**
   * @private
   * @param {Object} searchItem
   * @returns {Object}
   */
  _createSource(searchItem) {
    const field = this.props.searchModel.fields[searchItem.fieldName];
    const type = field.type === "reference" ? "char" : field.type;
    const source = {
      active: true,
      description: searchItem.description,
      searchItemId: searchItem.id,
      searchItemOperator: searchItem.operator,
      id: nextSourceId++,
      operator: CHAR_FIELDS.includes(type) ? "ilike" : "=",
      type,
    };
    switch (type) {
      case "selection": {
        return Object.assign(source, {
          active: true,
          selection: field.selection,
        });
      }
      case "boolean": {
        return Object.assign(source, {
          active: true,
          selection: [
            [true, this.env._t("Yes")],
            [false, this.env._t("No")],
          ],
        });
      }
      case "many2one": {
        return Object.assign(source, {
          expand: true,
          expanded: false,
          relation: field.relation,
          context: field.context,
          domain: searchItem.domain,
        });
      }
      default:
        return source;
    }
  }
  /**
   * @private
   * @param {Source} source
   * @param {[any, string]} values
   * @param {boolean} [active=true]
   */
  _createSubSource(source, values, active = true) {
    const [value, description] = values;
    const subSource = {
      active,
      searchItemId: source.searchItemId,
      searchItemOperator: source.searchItemOperator,
      id: nextSourceId++,
      description,
      operator: "=",
      parent: source,
      value,
    };
    return subSource;
  }
  /**
   * @private
   * @param {Object} source
   * @param {boolean} shouldExpand
   */
  async _expandSource(source, shouldExpand) {
    source.expanded = shouldExpand;
    if (shouldExpand) {
      let domain = [];
      if (source.domain) {
        try {
          domain = source.domain.toList();
        } catch (e) {}
      }
      const results = await this.model(source.relation).call("name_search", domain, {
        context: source.context,
        limit: 8,
        name: this.state.inputValue.trim(),
      });
      const options = results.map((result) => this._createSubSource(source, result));
      const parentIndex = this.state.sources.indexOf(source);
      if (!options.length) {
        options.push(this._createSubSource(source, this.noResultItem, false));
      }
      this.state.sources.splice(parentIndex + 1, 0, ...options);
    } else {
      this.state.sources = this.state.sources.filter(
        (src) => !("parent" in src) || src.parent !== source
      );
    }
  }
  /**
   * @private
   * @param {string} query
   */
  _filterSources(query) {
    const sources = [];
    for (const source of this.autoCompleteSources) {
      if ("selection" in source) {
        const options = [];
        // source.selection.forEach(result => {
        //     if (fuzzy.test(query, result[1].toLowerCase())) {
        //         options.push(this._createSubSource(source, result));
        //     }
        // });
        if (options.length) {
          sources.push(source, ...options);
        }
      } else if (this._validateSource(query, source)) {
        sources.push(source);
      }
      if ("expanded" in source) {
        source.expanded = false;
      }
    }
    return sources;
  }
  /**
   * Focus the search facet at the designated index if any.
   * @private
   */
  _focusFacet(index) {
    const facets = this.el.getElementsByClassName("o_searchview_facet");
    if (facets.length) {
      facets[index].focus();
    }
  }
  /**
   * Try to parse the given rawValue according to the type of the given
   * source field type. The returned formatted value is the one that will
   * supposedly be sent to the server.
   * @private
   * @param {string} rawValue
   * @param {Object} source
   * @returns {string}
   */
  _parseWithSource(rawValue, source) {
    let parsedValue;
    //ToDO
    //const { type } = source;
    // const parser = field_utils.parse[type];
    // switch (type) {
    //     case 'date':
    //     case 'datetime': {
    //         const parsedDate = parser(rawValue, { type }, { timezone: true });
    //         const dateFormat = type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD';
    //         const momentValue = moment(parsedDate, dateFormat);
    //         if (!momentValue.isValid()) {
    //             throw new Error('Invalid date');
    //         }
    //         parsedValue = parsedDate.toJSON();
    //         break;
    //     }
    //     case 'many2one': {
    //         parsedValue = rawValue;
    //         break;
    //     }
    //     default: {
    //         parsedValue = parser(rawValue);
    //     }
    // }
    parsedValue = rawValue;
    return parsedValue;
  }
  /**
   * @private
   * @param {Source} source
   */
  _selectSource(source) {
    // Inactive sources are:
    // - Selection sources
    // - "no result" items
    if (source.active) {
      let label;
      let value;
      if ("value" in source) {
        label = source.description;
        value = source.value;
      } else {
        label = this.state.inputValue;
        value = this._parseWithSource(label, source);
      }
      const operator = source.searchItemOperator || source.operator;
      const autocompleteValue = { value, label, operator };
      this.props.searchModel.addAutoCompletionValues(source.searchItemId, autocompleteValue);
    }
    this._closeAutoComplete();
  }
  /**
   * @private
   * @param {string} query
   * @param {Object} source
   * @returns {boolean}
   */
  _validateSource(query, source) {
    try {
      this._parseWithSource(query, source);
    } catch (err) {
      return false;
    }
    return true;
  }
  //---------------------------------------------------------------------
  // Handlers
  //---------------------------------------------------------------------
  /**
   * @private
   * @param {Object} facet
   * @param {number} facetIndex
   * @param {KeyboardEvent} ev
   */
  _onFacetKeydown(facet, facetIndex, ev) {
    switch (ev.key) {
      case "ArrowLeft":
        if (facetIndex === 0) {
          this.inputRef.el.focus();
        } else {
          this._focusFacet(facetIndex - 1);
        }
        break;
      case "ArrowRight":
        const facets = this.el.getElementsByClassName("o_searchview_facet");
        if (facetIndex === facets.length - 1) {
          this.inputRef.el.focus();
        } else {
          this._focusFacet(facetIndex + 1);
        }
        break;
      case "Backspace":
        this._onFacetRemove(facet);
        break;
    }
  }
  /**
   * @private
   * @param {Facet} facet
   */
  _onFacetRemove(facet) {
    this.props.searchModel.deactivateGroup(facet.groupId);
  }
  /**
   * @private
   * @param {KeyboardEvent} ev
   */
  _onSearchKeydown(ev) {
    if (ev.isComposing) {
      // This case happens with an IME for example: we let it handle all key events.
      return;
    }
    const currentItem = this.state.sources[this.state.focusedItem] || {};
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        if (Object.keys(this.state.sources).length) {
          let nextIndex = this.state.focusedItem + 1;
          if (nextIndex >= this.state.sources.length) {
            nextIndex = 0;
          }
          this.state.focusedItem = nextIndex;
        } else {
          // TODO
          // this.env.bus.trigger('focus-view');
        }
        break;
      case "ArrowLeft":
        if ("expanded" in currentItem && currentItem.expanded) {
          // Priority 1: fold expanded item.
          ev.preventDefault();
          this._expandSource(currentItem, false);
        } else if ("parent" in currentItem && currentItem.parent) {
          // Priority 2: focus parent item.
          ev.preventDefault();
          this.state.focusedItem = this.state.sources.indexOf(currentItem.parent);
          // Priority 3: Do nothing (navigation inside text).
        }
        // TODO
        // else if (ev.target.selectionStart === 0) {
        //     // Priority 4: navigate to rightmost facet.
        //     this._focusFacet(this.props.searchModel.get("facets").length - 1);
        // }
        break;
      case "ArrowRight":
        // TODO
        // if (ev.target.selectionStart === this.state.inputValue.length) {
        //     // Priority 1: Do nothing (navigation inside text).
        //     if (currentItem.expand) {
        //         // Priority 2: go to first child or expand item.
        //         ev.preventDefault();
        //         if (currentItem.expanded) {
        //             this.state.focusedItem ++;
        //         } else {
        //             this._expandSource(currentItem, true);
        //         }
        //     } else if (ev.target.selectionStart === this.state.inputValue.length) {
        //         // Priority 3: navigate to leftmost facet.
        //         this._focusFacet(0);
        //     }
        // }
        break;
      case "ArrowUp":
        ev.preventDefault();
        let previousIndex = this.state.focusedItem - 1;
        if (previousIndex < 0) {
          previousIndex = this.state.sources.length - 1;
        }
        this.state.focusedItem = previousIndex;
        break;
      case "Backspace":
        if (!this.state.inputValue.length) {
          // TODO
          // const facets = this.props.searchModel.getFacets();
          // if (facets.length) {
          //     this._onFacetRemove(facets[facets.length - 1]);
          // }
        }
        break;
      case "Enter":
        if (!this.state.inputValue.length) {
          // TODO
          // this.props.searchModel.dispatch('search');
          break;
        }
      /* falls through */
      case "Tab":
        if (this.state.inputValue.length) {
          this._selectSource(currentItem);
        }
        break;
      case "Escape":
        if (this.state.sources.length) {
          this._closeAutoComplete();
        }
        break;
    }
  }
  /**
   * @private
   * @param {InputEvent} ev
   */
  _onSearchInput(ev) {
    this.state.inputValue = ev.target.value;
    const wasVisible = this.state.sources.length;
    const query = this.state.inputValue.trim().toLowerCase();
    if (query.length) {
      this.state.sources = this._filterSources(query);
    } else if (wasVisible) {
      this._closeAutoComplete();
    }
  }
  /**
   * Only handled if the user has moved its cursor at least once after the
   * results are loaded and displayed.
   * @private
   * @param {number} resultIndex
   */
  _onSourceMousemove(resultIndex) {
    this.state.focusedItem = resultIndex;
  }
  /**
   * @private
   * @param {MouseEvent} ev
   */
  _onWindowClick(ev) {
    if (this.state.sources.length && !this.el.contains(ev.target)) {
      this._closeAutoComplete();
    }
  }
  /**
   * @private
   * @param {KeyboardEvent} ev
   */
  _onWindowKeydown(ev) {
    if (ev.key === "Escape" && this.state.sources.length) {
      ev.preventDefault();
      ev.stopPropagation();
      this._closeAutoComplete();
    }
  }
}
SearchBar.template = "wowl.SearchBar";
