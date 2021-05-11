export interface ViewProps {
    // mandatory
    
    modelName: string;
    type: string;
        
    // view description
    arch?: string;
    fields?: Object;
    viewId?: number|false;

    views?: Array[];
    
    actionMenus?: Object;
    loadActionMenus?: Boolean;

    // search view description
    searchViewArch?: string;
    searchViewFields?: Object;
    searchViewId?: number|false;
    
    irFilters?: IrFilter[];
    loadIrFilters?: Boolean;
    
    // search query
    context?: Object;
    domain?: DomainRepr;
    domains?: Object[]; // to rewok
    groupBy?: string[];
    orderBy?: string[];
    
    // search state
    __exportSearchState__?: CallbackRecorder;
    searchState?: Object;
    
    // others props manipulated by View or WithSearch
    __saveParams__?: CallbackRecorder;
    actionId?: number|false;
    activateFavorite?: Boolean;
    displayName?: string;
    dynamicFilters?: Object[];
    loadSearchPanel?: Boolean;
    noContentHelp?: string;
    searchMenuTypes?: string[];
    useSampleModel?: Boolean;

    // all props (sometimes modified like "views", "domain",...) to concrete view
    // if it validate them (a filtering is done in case props validation is defined in concrete view)
    [key:string]: any;
}


/**
 * To manage:
 * 
  Relate to search
      searchModel // search model state (searchItems, query)
      searchPanel // search panel component state (expanded (hierarchy), scrollbar)

  Related to config/display/layout
      displayName // not exactly actionName,... action.display_name || action.name
      breadcrumbs
      withBreadcrumbs // 'no_breadcrumbs' in context ? !context.no_breadcrumbs : true,
      withControlPanel // this.withControlPanel from constructor
      withSearchBar // 'no_breadcrumbs' in context ? !context.no_breadcrumbs : true,
      withSearchPanel // this.withSearchPanel from constructor
      search_panel // = params.search_panel or context.search_panel

  Prepare for concrete view
      activeActions

  Do stuff in View comp
      banner // from arch = this.arch.attrs.banner_route
*/