import { ActionDescription } from "../../src/services/action_manager/action_manager";
import {
  Context,
  Domain,
  ModelData,
  ModelMethod,
  ModelMethods,
  Service,
  ViewId,
  ViewType,
} from "../../src/types";
import { MockRPC, makeFakeRPCService, makeMockFetch } from "./mocks";
import { MenuData } from "../../src/services/menus";
import { TestConfig } from "./utility";
import { Registry } from "../../src/core/registry";
import { evaluateExpr } from "../../src/core/py/index";
import { DBRecord, ORMCommand } from "../../src/services/model";

// Aims:
// - Mock service model high level
// - propose mock model.call lower level
// - propose mock RPC low level

// Can be passed data
// returns at least model service

export interface ServerData {
  models?: {
    [modelName: string]: ModelData;
  };
  actions?: {
    [key: string]: ActionDescription;
  };
  views?: {
    [key: string]: string;
  };
  menus?: MenuData;
}

/*
 * DEFAULT ROUTES AND METHODS
 */
function loadMenus(this: ServerData) {
  return (
    this.menus || {
      root: { id: "root", children: [1], name: "root", appID: "root" },
      1: { id: 1, children: [], name: "App0", appID: 1 },
    }
  );
}
function loadAction(this: ServerData, route: string, routeArgs?: any) {
  const { action_id } = routeArgs || {};
  return (action_id && this.actions && this.actions[action_id]) || {};
}
const defaultRoutes: any = {
  "/web/action/load": loadAction,
  "/wowl/load_menus": loadMenus,
  "/web/dataset/search_read": searchRead,
};
const defaultModelMethods: ModelMethods = {
  load_views: loadViews,
  read,
  onchange: _mockOnchange,
};
function getModelMethod(
  serverData: ServerData | undefined,
  modelName: string,
  methodName: string
): ModelMethod | undefined {
  return (
    serverData &&
    serverData.models &&
    serverData.models[modelName] &&
    serverData.models[modelName].methods &&
    serverData.models[modelName].methods![methodName]
  );
}

function makeModelMagicFields(models: ServerData["models"]): void {
  if (!models) {
    return;
  }
  Object.entries(models).forEach(([mName, model]) => {
    if (!("id" in model.fields)) {
      model.fields.id = { string: "ID", type: "number" };
    }
    if (!("display_name" in model.fields)) {
      model.fields.display_name = { string: "Display Name", type: "char" };
    }
    if (!("__last_update" in model.fields)) {
      model.fields.__last_update = { string: "Last Modified on", type: "datetime" };
    }
    if (!("name" in model.fields)) {
      model.fields.name = { string: "Name", type: "char", default: "name" };
    }
  });
}

export function makeMockServer(
  config: TestConfig,
  serverData?: ServerData,
  mockRPC?: MockRPC
): void {
  serverData = serverData || {};
  makeModelMagicFields(serverData.models);
  const _mockRPC: MockRPC = async (...params: Parameters<MockRPC>) => {
    const [route, routeArgs] = params;
    let res;
    if (mockRPC) {
      res = await mockRPC.apply(serverData, params);
    }
    if (res === undefined && routeArgs && "model" in routeArgs) {
      const { model, method } = routeArgs;
      const localMethod = getModelMethod(serverData, model, method);
      if (localMethod) {
        res = await localMethod.call(serverData, routeArgs.args, routeArgs.kwargs);
      }
      if (res === undefined && method in defaultModelMethods) {
        res = await defaultModelMethods[routeArgs.method].call(
          serverData,
          routeArgs.args,
          routeArgs.kwargs,
          routeArgs.model
        );
      }
    }
    if (res === undefined && route in defaultRoutes) {
      res = await defaultRoutes[route].call(serverData, route, routeArgs);
    }
    return res;
  };
  const rpcService = makeFakeRPCService(_mockRPC);
  config.browser = config.browser || {};
  config.browser.fetch = makeMockFetch(_mockRPC);
  config.services = config.services || new Registry<Service>();
  config.services.add("rpc", rpcService);
}

interface loadViewsKwargs {
  views: [ViewId, ViewType][];
  options: {
    action_id: number | false;
    load_filters: boolean;
    toolbar: boolean;
  };
  context: Context;
}

function loadViews(
  this: ServerData,
  args: any[],
  kwargs: loadViewsKwargs,
  model?: string
): {
  fields: FVG["fields"];
  fields_views: {
    [vType: string]: {
      fields: FVG["fields"];
    };
  };
} {
  const res: ReturnType<typeof loadViews> = {
    fields: fieldsGet.call(this, [], {}, model!),
    fields_views: {},
  };
  kwargs.views.forEach(([viewId, viewType]) => {
    res.fields_views[viewType] = fieldsViewGet.call(this, [viewId, viewType], kwargs, model!);
  });
  return res;
}

function fieldsGet(this: ServerData, args: any[], kwargs: any, model?: string) {
  return this.models![model!].fields;
}
/**
 * helper: read a string describing an arch, and returns a simulated
 * 'field_view_get' call to the server. Calls processViews() of data_manager
 * to mimick the real behavior of a call to loadViews().
 *
 * @param {Object} params
 * @param {string|Object} params.arch a string OR a parsed xml document
 * @param {Number} [params.view_id] the id of the arch's view
 * @param {string} params.model a model name (that should be in this.data)
 * @param {Object} params.toolbar the actions possible in the toolbar
 * @param {Object} [params.viewOptions] the view options set in the test (optional)
 * @returns {Object} an object with 2 keys: arch and fields
 */
function fieldsViewGet(this: ServerData, args: any[], kwargs: any, model: string) {
  const [view_id, view_type, toolbar] = args;
  const { viewId, arch } = _getView.call(this, model!, view_id, view_type, kwargs.context);
  //var viewOptions = params.viewOptions || {};
  if (!(model! in this.models!)) {
    throw new Error("Model " + model + " was not defined in mock server data");
  }
  const fields = Object.assign({}, this.models![model!].fields);
  const fvg = _fieldsViewGet.call(this, arch, model, fields, kwargs.context || {});
  if (toolbar) {
    fvg.toolbar = toolbar;
  }
  if (viewId) {
    fvg.view_id = viewId;
  }
  return fvg;
}

function _getView(
  this: ServerData,
  model: string,
  viewId: number | false,
  viewType: ViewType,
  context: Context
): {
  viewId: number;
  arch: string;
} {
  if (!viewId) {
    const contextKey = (viewType === "list" ? "tree" : viewType) + "_view_ref";
    if (contextKey in context) {
      viewId = context[contextKey];
    }
  }
  const key = [model, viewId, viewType].join(",");
  let arch: string | undefined = this.views![key];
  if (!arch) {
    const genericViewKey = Object.keys(this.views!).find((fullKey) => {
      const [_model, _viewID, _viewType] = fullKey.split(",");
      viewId = parseInt(_viewID, 10);
      return _model === model && _viewType === viewType;
    });
    arch = genericViewKey && this.views![genericViewKey];
  }
  if (!arch) {
    throw new Error("No arch found for key " + key);
  }
  return {
    viewId: viewId as number,
    arch,
  };
}

type Modifiers = "invisible" | "readonly" | "required";

interface FVG {
  arch: string;
  fields: { [fieldName: string]: any };
  model: string;
  type: ViewType;
  toolbar?: boolean;
  view_id?: number;
}

function _fieldsViewGet(
  this: ServerData,
  arch: string | Element,
  model: string,
  fields: { [fieldName: string]: any },
  context: Context,
  processedNodes?: Element[]
): FVG {
  if (!processedNodes) {
    processedNodes = [];
  }
  function isNodeProcessed(node: Element): boolean {
    return processedNodes!.findIndex((n) => n.isSameNode(node)) > -1;
  }

  const modifiersNames: Modifiers[] = ["invisible", "readonly", "required"];
  const onchanges = this.models![model].onchanges || {};
  const fieldNodes: {
    [name: string]: Element;
  } = {};
  const groupbyNodes: {
    [name: string]: Element;
  } = {};

  let doc: Element;
  if (typeof arch === "string") {
    const domParser = new DOMParser();
    doc = domParser.parseFromString(arch, "text/xml").documentElement;
  } else {
    doc = arch;
  }

  //const inTreeView = (doc.nodeName === 'TREE');

  // mock _postprocess_access_rights
  const isBaseModel = !context.base_model_name || model === context.base_model_name;
  const views = ["kanban", "tree", "form", "gantt", "activity"];
  if (isBaseModel && views.indexOf(doc.tagName) !== -1) {
    for (const action of ["create", "delete", "edit", "write"]) {
      if (!doc.getAttribute(action) && action in context && !context[action]) {
        doc.setAttribute(action, "false");
      }
    }
  }

  traverseElementTree(doc, (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return false;
    }
    const modifiers: {
      [name: string]: Domain | any;
    } = {};

    const isField = node.nodeName === "FIELD";
    const isGroupby = node.nodeName === "GROUPBY";

    if (isField) {
      const fieldName = node.getAttribute("name")!;
      fieldNodes[fieldName!] = node;

      // 'transfer_field_to_modifiers' simulation
      const field = fields[fieldName];

      if (!field) {
        throw new Error("Field " + fieldName + " does not exist");
      }
      const defaultValues: any = {};
      const stateExceptions: any = {}; // what is this ?
      modifiersNames.forEach((attr) => {
        stateExceptions[attr] = [];
        defaultValues[attr] = !!field[attr];
      });
      // LPE: what is this ?
      /*                _.each(field.states || {}, function (modifs, state) {
                    _.each(modifs, function (modif) {
                        if (defaultValues[modif[0]] !== modif[1]) {
                            stateExceptions[modif[0]].append(state);
                        }
                    });
                });*/
      Object.entries(defaultValues).forEach(([attr, defaultValue]) => {
        if (stateExceptions[attr].length) {
          modifiers[attr] = [["state", defaultValue ? "not in" : "in", stateExceptions[attr]]];
        } else {
          modifiers[attr] = defaultValue;
        }
      });
    } else if (isGroupby && !isNodeProcessed(node)) {
      const groupbyName = node.getAttribute("name")!;
      fieldNodes[groupbyName] = node;
      groupbyNodes[groupbyName] = node;
    }

    // 'transfer_node_to_modifiers' simulation
    let attrs = node.getAttribute("attrs");
    if (attrs) {
      attrs = evaluateExpr(attrs);
      Object.assign(modifiers, attrs);
    }

    const states = node.getAttribute("states");
    if (states) {
      if (!modifiers.invisible) {
        modifiers.invisible = [];
      }
      modifiers.invisible.push(["state", "not in", states.split(",")]);
    }

    // implem from JSON in Py
    /*            const inListHeader = inTreeView && node.closest('header');
            _.each(modifiersNames, function (a) {
                const mod = node.getAttribute(a);
                if (mod) {
                    const pyevalContext = window.py.dict.fromJSON(context || {});
                    var v = pyUtils.py_eval(mod, {context: pyevalContext}) ? true: false;
                    if (inTreeView && !inListHeader && a === 'invisible') {
                        modifiers.column_invisible = v;
                    } else if (v || !(a in modifiers) || !_.isArray(modifiers[a])) {
                        modifiers[a] = v;
                    }
                }
            });*/

    /*            _.each(modifiersNames, function (a) {
                if (a in modifiers && (!!modifiers[a] === false || (_.isArray(modifiers[a]) && !modifiers[a].length))) {
                    delete modifiers[a];
                }
            });*/

    if (Object.keys(modifiers).length) {
      node.setAttribute("modifiers", JSON.stringify(modifiers));
    }

    if (isGroupby && !isNodeProcessed(node)) {
      return false;
    }

    return !isField;
  });

  let relModel, relFields;
  Object.entries(fieldNodes).forEach(([name, node]) => {
    const field = fields[name];
    if (field.type === "many2one" || field.type === "many2many") {
      const canCreate = node.getAttribute("can_create");
      node.setAttribute("can_create", canCreate || "true");
      const canWrite = node.getAttribute("can_write");
      node.setAttribute("can_write", canWrite || "true");
    }
    if (field.type === "one2many" || field.type === "many2many") {
      field.views = {};
      Array.from(node.children).forEach((children) => {
        if (children.tagName) {
          // skip text nodes
          relModel = field.relation;
          relFields = Object.assign({}, this.models![relModel].fields);
          field.views[children.tagName] = _fieldsViewGet.call(
            this,
            children,
            relModel,
            relFields,
            Object.assign({}, context, { base_model_name: model }),
            processedNodes
          );
        }
      });
    }

    // add onchanges
    if (name in onchanges) {
      node.setAttribute("on_change", "1");
    }
  });
  Object.entries(groupbyNodes).forEach(([name, node]) => {
    const field = fields[name];
    if (field.type !== "many2one") {
      throw new Error("groupby can only target many2one");
    }
    field.views = {};
    relModel = field.relation;
    relFields = Object.assign({}, this.models![relModel].fields);
    processedNodes!.push(node);
    // postprocess simulation
    field.views.groupby = _fieldsViewGet.call(
      this,
      node,
      relModel,
      relFields,
      context,
      processedNodes
    );
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  });

  const xmlSerializer = new XMLSerializer();
  const processedArch = xmlSerializer.serializeToString(doc);
  const fieldsInView: typeof fields = {};
  Object.entries(fields).forEach(([fname, field]) => {
    if (fname in fieldNodes) {
      fieldsInView[fname] = field;
    }
  });

  return {
    arch: processedArch,
    fields: fieldsInView,
    model: model,
    type: doc.nodeName === "TREE" ? "list" : doc.nodeName.toLowerCase(),
  };
}

interface SearchReadParams {
  model: string;
}
function searchRead(
  this: ServerData,
  route: string,
  params: SearchReadParams
): {
  length: number;
  records: DBRecord[];
} {
  const { model } = params;
  const records = this.models![model].records;
  const length = records.length;
  return { length, records };
}

type readArgs = [number[], string[]];
function read(this: ServerData, args: readArgs | any[], kwargs: any, model?: string) {
  const [ids] = args;
  const Model = this.models![model!];
  return Model.records.filter((rec) => ids.includes(rec.id));
}

export function traverseElementTree(tree: Element, cb: (subTree: Element) => boolean): void {
  if (cb(tree)) {
    Array.from(tree.children).forEach((c) => traverseElementTree(c, cb));
  }
}

/**
 * Converts an Object representing a record to actual return Object of the
 * python `onchange` method.
 * Specifically, it applies `name_get` on many2one's and transforms raw id
 * list in orm command lists for x2many's.
 * For x2m fields that add or update records (ORM commands 0 and 1), it is
 * recursive.
 *
 * @private
 * @param {string} model: the model's name
 * @param {Object} values: an object representing a record
 * @returns {Object}
 */
function _convertToOnChange(this: ServerData, model: string, values: Partial<DBRecord>) {
  Object.entries(values).forEach(([fname, val]) => {
    const field = this.models![model].fields[fname];
    if (field.type === "many2one" && typeof val === "number") {
      // implicit name_get
      const m2oRecord = this.models![field.relation!].records.find((r) => r.id === val);
      values[fname] = [val, m2oRecord!.display_name];
    } else if (field.type === "one2many" || field.type === "many2many") {
      // TESTS ONLY
      // one2many_ids = [1,2,3] is a simpler way to express it than orm commands
      const isCommandList = Array.isArray(val) && Array.isArray(val[0]);
      if (!isCommandList) {
        values[fname] = [[6, false, val]];
      } else {
        (val as ORMCommand[]).forEach((cmd) => {
          if (cmd[0] === 0 || cmd[0] === 1) {
            cmd[2] = _convertToOnChange.call(this, field.relation!, cmd[2]);
          }
        });
      }
    }
  });
  return values;
}

/**
 * Simulate an 'onchange' rpc
 *
 * @private
 * @param {string} model
 * @param {Object} args
 * @param {Object} args[1] the current record data
 * @param {string|string[]} [args[2]] a list of field names, or just a field name
 * @param {Object} args[3] the onchange spec
 * @param {Object} [kwargs]
 * @returns {Object}
 */
function _mockOnchange(this: ServerData, args: any[], kwargs: any, model?: string) {
  const currentData: DBRecord = args[1];
  const onChangeSpec: { [fieldChain: string]: "1" | "0" } = args[3];
  let fields: string[] = args[2];
  const onchanges = this.models![model!].onchanges || {};

  if (fields && !(fields instanceof Array)) {
    fields = [fields];
  }
  const firstOnChange = !fields || !fields.length;
  const onchangeVals: Partial<DBRecord> = {};
  let defaultVals: Partial<DBRecord> | undefined = undefined;
  let nullValues: { [fname: string]: any };
  if (firstOnChange) {
    const fieldsFromView = Object.keys(onChangeSpec).reduce((acc, fname) => {
      fname = fname.split(".", 1)[0];
      if (!acc.includes(fname)) {
        acc.push(fname);
      }
      return acc;
    }, [] as string[]);
    const defaultingFields = fieldsFromView.filter((fname) => !(fname in currentData));
    defaultVals = _mockDefaultGet.call(this, model!, [defaultingFields], kwargs);
    // It is the new semantics: no field in arguments means we are in
    // a default_get + onchange situation
    fields = fieldsFromView;
    nullValues = {};
    fields
      .filter((fName) => !Object.keys(defaultVals as Partial<DBRecord>).includes(fName))
      .forEach((fName) => {
        nullValues[fName] = false;
      });
  }
  Object.assign(currentData, defaultVals);
  fields.forEach((field) => {
    if (field in onchanges) {
      const changes = Object.assign({}, nullValues, currentData);
      onchanges[field](changes);
      Object.entries(changes).forEach(([key, value]) => {
        if (currentData[key] !== value) {
          onchangeVals[key] = value;
        }
      });
    }
  });

  return {
    value: _convertToOnChange.call(this, model!, Object.assign({}, defaultVals, onchangeVals)),
  };
}

/**
 * Simulate a 'default_get' operation
 *
 * @private
 * @param {string} modelName
 * @param {array[]} args a list with a list of fields in the first position
 * @param {Object} [kwargs={}]
 * @param {Object} [kwargs.context] the context to eventually read default
 *   values
 * @returns {Object}
 */
function _mockDefaultGet(
  this: ServerData,
  modelName: string,
  args: any[],
  kwargs: any = {}
): Partial<DBRecord> {
  const fields = args[0];
  const model = this.models![modelName];
  const result: Partial<DBRecord> = {};
  for (const fieldName of fields) {
    const key = "default_" + fieldName;
    if (kwargs.context && key in kwargs.context) {
      result[fieldName] = kwargs.context[key];
      continue;
    }
    const field = model.fields[fieldName];
    if ("default" in field) {
      result[fieldName] = field.default;
      continue;
    }
  }
  for (const fieldName in result) {
    const field = model.fields[fieldName];
    if (field.type === "many2one") {
      const recordExists = this.models![field.relation!].records.some(
        (r) => r.id === result[fieldName]
      );
      if (!recordExists) {
        delete result[fieldName];
      }
    }
  }
  return result;
}
