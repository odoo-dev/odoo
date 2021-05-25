
export type DataPointId = string;
export type DataPointType = "record" | "list";

export interface DataPointInitParams {
  aggregateValues?: object;
  context?: object;
  count?: number;
  data?: Record<string, any>;
  domain?: object[];
  fieldsInfo?: object;
  fieldsMeta?: Record<string, any>;
  groupedBy?: string[];
  groupsLimit?: number;
  isOpen?: boolean;
  limit?: number;
  modelName: string;
  offset?: number;
  openGroupByDefault?: boolean;
  orderedBy?: object[];
  orderedResIds?: number[];
  parentId?: DataPointId;
  rawContext?: object;
  ref?: any;
  relationField?: string;
  resId?: number;
  resIds?: number[];
  static?: boolean;
  type?: DataPointType;
  value?: any;
  viewType?: string;
}

export interface DataPoint {
  aggregateValues: object;
  cache: object;
  changes: Record<string, any> | null;
  context: object;
  count: number;
  data: Record<string, any>;
  dirty: boolean;
  domain: any[];
  domains: object;
  editionViewType: object;
  fieldsInfo: object;
  fieldsMeta: Record<string, any>;
  groupedBy: string[];
  groupsCount: number;
  groupsLimit: number;
  groupsOffset: number;
  id: DataPointId;
  isOpen: boolean;
  limit: number;
  loadMoreOffset: number;
  modelName: string;
  offset: number;
  openGroupByDefault
  orderedBy: object[];
  orderedResIds: number[];
  parentId: DataPointId | null;
  rawChanges: object;
  rawContext: object;
  ref: any;
  relationField: string | null;
  resId: number | string | null;
  resIds: number[];
  specialData: object;
  specialDataCache: object;
  static: boolean;
  type: DataPointType;
  value: any;
  viewType: string;
}

export interface FieldInfo {
  name: string;
  widget?: string;
}
