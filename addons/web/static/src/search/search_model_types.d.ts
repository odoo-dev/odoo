interface SectionCommon { // check optional keys
  color: string;
  description: string;
  errorMsg: [string];
  enableCounters: boolean;
  expand: boolean;
  fieldName: string;
  icon: string;
  id: number;
  limit: number;
  values: Map<any,any>;
}

export interface Category extends SectionCommon {
  type: "category";
  hierarchize: boolean;
}

export interface Filter extends SectionCommon {
  type: "filter";
  domain: string;
  groupBy: string;
  groups: Map<any,any>;
}

export type Section = Category | Filter;

export type SectionPredicate = (section: Section) => boolean;
