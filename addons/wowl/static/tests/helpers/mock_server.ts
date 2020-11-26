import { ActionDescription } from "../../src/action_manager/action_manager";
import { Context, Domain, ModelData, Service, ViewId, ViewType } from "../../src/types";
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

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface ServerData {
  models?: Models;
  menus?: MenuData;
  actions?: Actions;
  views?: Archs;
}
interface Actions {
  [key: string]: ActionDescription;
}
interface ToolbarInfo {
  print?: any[];
  action?: any[];
}
interface MockedModelData extends ModelData {
  toolbar?: ToolbarInfo;
}
interface Models {
  [key: string]: MockedModelData;
}
interface Archs {
  [key: string]: string;
}
interface ServerOptions {
  debug?: boolean;
}

interface LoadActionKwargs {
  action_id: string | number;
}

type Modifiers = "invisible" | "readonly" | "required";

interface FVG {
  arch: string;
  fields: { [fieldName: string]: any };
  model: string;
  type: ViewType;
  toolbar?: ToolbarInfo;
  view_id?: number;
}

type FieldsViewGetArgs = [number | false, string];
interface _FVGParams {
  arch: string | Element;
  modelName: string;
  fields: { [fieldName: string]: any };
  context: Context;
  processedNodes?: Element[];
}

interface LoadViewsKwargs {
  views: [ViewId, ViewType][];
  options: {
    action_id: number | false;
    load_filters: boolean;
    toolbar: boolean;
  };
  context: Context;
}
interface LoadViewsReturnType {
  fields: FVG["fields"];
  fields_views: {
    [vType: string]: {
      fields: FVG["fields"];
    };
  };
}

type ReadArgs = [number[] | number, string[]?];

interface SearchReadControllerParams {
  model: string;
  domain?: Domain;
  fields?: string[];
  offset?: number;
  limit?: number;
  sort?: string;
  context?: Context;
}
interface SearchReadControllerReturnType {
  length: number;
  records: DBRecord[];
}

type SearchReadArgs = [Domain, string[], number, number, string];
interface SearchReadKwargs {
  context: Context;
  domain?: Domain;
  fields?: string[];
  offset?: number;
  limit?: number;
  order?: string;
}

interface OnchangeSpec {
  [fieldChain: string]: "1" | "0";
}
type OnchangeArgs = [any, DBRecord, string[] | string, OnchangeSpec];

type WriteArgs = [number[], Object];

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function traverseElementTree(tree: Element, cb: (subTree: Element) => boolean): void {
  if (cb(tree)) {
    Array.from(tree.children).forEach((c) => traverseElementTree(c, cb));
  }
}

// -----------------------------------------------------------------------------
// MockServer
// -----------------------------------------------------------------------------

class MockServer {
  models: Models;
  menus: MenuData | null;
  actions: Actions;
  archs: Archs;
  debug: boolean;
  constructor(data: ServerData, options: ServerOptions = {}) {
    this.models = data.models || {};
    this.actions = data.actions || {};
    this.menus = data.menus || null;
    this.archs = data.views || {};
    this.debug = options.debug || false;

    Object.entries(this.models).forEach(([modelName, model]) => {
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

      model.records = model.records || [];
      for (var i = 0; i < model.records.length; i++) {
        const values = model.records[i];
        // add potentially missing id
        const id = values.id === undefined ? this.getUnusedID(modelName) : values.id;
        // create a clean object, initial values are passed to write
        model.records[i] = { id };
        // ensure initial data goes through proper conversion (x2m, ...)
        this.applyDefaults(model, values);
        this.writeRecord(modelName, values, id, { ensureIntegrity: false });
      }

      model.onchanges = model.onchanges || {};
      model.methods = model.methods || {};
    });
  }

  /**
   * Simulate a complete RPC call. This is the main method for this class.
   *
   * This method also log incoming and outgoing data, and stringify/parse data
   * to simulate a barrier between the server and the client. It also simulate
   * server errors.
   */
  async performRPC(route: string, args: Object): Promise<any> {
    args = JSON.parse(JSON.stringify(args));
    if (this.debug) {
      console.log("%c[rpc] request " + route, "color: blue; font-weight: bold;", args);
      args = JSON.parse(JSON.stringify(args));
    }
    let result;
    // try {
    result = await this._performRPC(route, args);
    // } catch {
    //   const message = result && result.message;
    //   const event = result && result.event;
    //   const errorString = JSON.stringify(message || false);
    //   console.warn(
    //     "%c[rpc] response (error) " + route,
    //     "color: orange; font-weight: bold;",
    //     JSON.parse(errorString)
    //   );
    //   return Promise.reject({ message: errorString, event });
    // }
    const resultString = JSON.stringify(result || false);
    if (this.debug) {
      console.log(
        "%c[rpc] response" + route,
        "color: blue; font-weight: bold;",
        JSON.parse(resultString)
      );
    }
    return JSON.parse(resultString);

    // TODO?
    // var abort = def.abort || def.reject;
    // if (abort) {
    //     abort = abort.bind(def);
    // } else {
    //     abort = function () {
    //         throw new Error("Can't abort this request");
    //     };
    // }
    // def.abort = abort;
  }

  fieldsViewGet(modelName: string, args: FieldsViewGetArgs, kwargs: LoadViewsKwargs): FVG {
    if (!(modelName in this.models)) {
      throw new Error(`Model ${modelName} was not defined in mock server data`);
    }

    // find the arch
    let [viewId, viewType] = args;
    if (!viewId) {
      const contextKey = (viewType === "list" ? "tree" : viewType) + "_view_ref";
      if (contextKey in kwargs.context) {
        viewId = kwargs.context[contextKey];
      }
    }
    const key = [modelName, viewId, viewType].join(",");
    let arch = this.archs[key];
    if (!arch) {
      const genericViewKey = Object.keys(this.archs).find((fullKey) => {
        const [_model, _viewID, _viewType] = fullKey.split(",");
        viewId = parseInt(_viewID, 10);
        return _model === modelName && _viewType === viewType;
      });
      if (genericViewKey) {
        arch = this.archs[genericViewKey];
      }
    }
    if (!arch) {
      throw new Error("No arch found for key " + key);
    }

    // generate a field_view_get result
    const fields = Object.assign({}, this.models[modelName].fields);
    // var viewOptions = params.viewOptions || {};
    const fvg = this._fieldsViewGet({ arch, modelName, fields, context: kwargs.context || {} });
    if (kwargs.options.toolbar) {
      fvg.toolbar = this.models[modelName].toolbar || {};
    }
    if (viewId) {
      fvg.view_id = viewId;
    }

    return fvg;
  }

  _fieldsViewGet(params: _FVGParams): FVG {
    let processedNodes = params.processedNodes || [];
    const { arch, context, fields, modelName } = params;
    function isNodeProcessed(node: Element): boolean {
      return processedNodes!.findIndex((n) => n.isSameNode(node)) > -1;
    }

    const modifiersNames: Modifiers[] = ["invisible", "readonly", "required"];
    const onchanges = this.models![modelName].onchanges || {};
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

    //const inTreeView = (doc.tagName === 'tree');

    // mock _postprocess_access_rights
    const isBaseModel = !context.base_model_name || modelName === context.base_model_name;
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

      const isField = node.tagName === "field";
      const isGroupby = node.tagName === "groupby";

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
            field.views[children.tagName] = this._fieldsViewGet({
              arch: children,
              modelName: relModel,
              fields: relFields,
              context: Object.assign({}, context, { base_model_name: modelName }),
              processedNodes,
            });
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
      field.views.groupby = this._fieldsViewGet({
        arch: node,
        modelName: relModel,
        fields: relFields,
        context,
        processedNodes,
      });
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
      model: modelName,
      type: doc.tagName === "tree" ? "list" : doc.tagName,
    };
  }

  /**
   * Converts an Object representing a record to actual return Object of the
   * python `onchange` method.
   * Specifically, it applies `name_get` on many2one's and transforms raw id
   * list in orm command lists for x2many's.
   * For x2m fields that add or update records (ORM commands 0 and 1), it is
   * recursive.
   *
   * @param {string} model: the model's name
   * @param {Object} values: an object representing a record
   * @returns {Object}
   */
  convertToOnChange(modelName: string, values: Partial<DBRecord>) {
    Object.entries(values).forEach(([fname, val]) => {
      const field = this.models[modelName].fields[fname];
      if (field.type === "many2one" && typeof val === "number") {
        // implicit name_get
        const m2oRecord = this.models[field.relation!].records.find((r) => r.id === val);
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
              cmd[2] = this.convertToOnChange(field.relation!, cmd[2]);
            }
          });
        }
      }
    });
    return values;
  }

  _performRPC(route: string, args: any): Promise<any> {
    switch (route) {
      case "/wowl/load_menus":
        return Promise.resolve(this.mockLoadMenus());
      case "/web/action/load":
        return Promise.resolve(this.mockLoadAction(args));
      case "/web/dataset/search_read":
        return Promise.resolve(this.mockSearchReadController(args));
    }
    if (
      route.indexOf("/web/image") >= 0 ||
      [".png", ".jpg"].includes(route.substr(route.length - 4))
    ) {
      return Promise.resolve();
    }
    switch (args.method) {
      case "create":
        return Promise.resolve(this.mockCreate(args.model, args.args[0]));
      case "load_views":
        return Promise.resolve(this.mockLoadViews(args.model, args.kwargs));
      case "onchange":
        return Promise.resolve(this.mockOnchange(args.model, args.args, args.kwargs));
      case "read":
        return Promise.resolve(this.mockRead(args.model, args.args));
      case "write":
        return Promise.resolve(this.mockWrite(args.model, args.args));
    }

    const model = this.models[args.model];
    const method = model && model.methods![args.method];
    if (method) {
      return Promise.resolve(method(args.model, args.args, args.kwargs));
    }

    throw new Error(`Unimplemented route: ${route}`);
  }

  mockCreate(modelName: string, values: DBRecord) {
    if ("id" in values) {
      throw new Error("Cannot create a record with a predefinite id");
    }
    const model = this.models[modelName];
    const id = this.getUnusedID(modelName);
    const record: DBRecord = { id };
    model.records.push(record);
    this.applyDefaults(model, values);
    this.writeRecord(modelName, values, id);
    return id;
  }

  /**
   * @param {string} modelName
   * @param {array[]} args a list with a list of fields in the first position
   * @param {Object} [kwargs={}]
   * @param {Object} [kwargs.context] the context to eventually read default
   *   values
   * @returns {Object}
   */
  mockDefaultGet(modelName: string, args: [string[]], kwargs: any = {}): Partial<DBRecord> {
    const fields = args[0];
    const model = this.models[modelName];
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
        const recordExists = this.models[field.relation!].records.some(
          (r) => r.id === result[fieldName]
        );
        if (!recordExists) {
          delete result[fieldName];
        }
      }
    }
    return result;
  }

  mockFieldsGet(modelName: string) {
    return this.models[modelName].fields;
  }

  mockLoadAction(kwargs: LoadActionKwargs) {
    const action = this.actions[kwargs.action_id];
    if (!action) {
      // when the action doesn't exist, the real server doesn't crash, it
      // simply returns false
      console.warn("No action found for ID " + kwargs.action_id);
    }
    return action || false;
  }

  mockLoadMenus() {
    let menus = this.menus;
    if (!menus) {
      menus = {
        root: { id: "root", children: [1], name: "root", appID: "root" },
        1: { id: 1, children: [], name: "App0", appID: 1 },
      };
    }
    return menus;
  }

  mockLoadViews(modelName: string, kwargs: LoadViewsKwargs): LoadViewsReturnType {
    const fieldsViews: any = {};
    kwargs.views.forEach(([viewId, viewType]) => {
      fieldsViews[viewType] = this.fieldsViewGet(modelName, [viewId, viewType], kwargs);
    });
    return {
      fields: this.mockFieldsGet(modelName),
      fields_views: fieldsViews,
    };
  }

  mockOnchange(modelName: string, args: OnchangeArgs, kwargs: any) {
    const currentData = args[1];
    const onChangeSpec = args[3];
    let fields = args[2] ? (Array.isArray(args[2]) ? args[2] : [args[2]]) : [];
    const onchanges = this.models[modelName].onchanges || {};

    const firstOnChange = !fields.length;
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
      defaultVals = this.mockDefaultGet(modelName, [defaultingFields], kwargs);
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
      value: this.convertToOnChange(modelName, Object.assign({}, defaultVals, onchangeVals)),
    };
  }

  mockRead(modelName: string, args: ReadArgs) {
    const model = this.models[modelName];
    let fields: string[];
    if (args[1] && args[1].length) {
      fields = [...new Set((args[1] as string[]).concat(["id"]))];
    } else {
      fields = Object.keys(model.fields);
    }

    const ids = Array.isArray(args[0]) ? args[0] : [args[0]];
    const records = ids.reduce((records: DBRecord[], id) => {
      if (!id) {
        throw new Error(
          "mock read: falsy value given as id, would result in an access error in actual server !"
        );
      }
      const record = model.records.find((r) => r.id === id);
      return record ? records.concat(record) : records;
    }, []);

    return records.map((record: DBRecord) => {
      const result: DBRecord = { id: record.id };
      for (const fieldName of fields) {
        const field = model.fields[fieldName];
        if (!field) {
          continue; // the field doens't exist on the model, so skip it
        }
        if (["float", "integer", "monetary"].includes(field.type)) {
          // read should return 0 for unset numeric fields
          result[fieldName] = record[fieldName] || 0;
        } else if (field.type === "many2one") {
          const CoModel = this.models![field.relation!];
          const relRecord = CoModel.records.find((r) => r.id === record[fieldName]);
          if (relRecord) {
            result[fieldName] = [record[fieldName], relRecord.display_name];
          } else {
            result[fieldName] = false;
          }
        } else if (field.type === "one2many" || field.type === "many2many") {
          result[fieldName] = record[fieldName] || [];
        } else {
          result[fieldName] = record[fieldName] || false;
        }
      }
      return result;
    });
  }

  mockSearchRead(modelName: string, args: SearchReadArgs, kwargs: SearchReadKwargs): DBRecord[] {
    const result = this.mockSearchReadController({
      model: modelName,
      domain: kwargs.domain || args[0],
      fields: kwargs.fields || args[1],
      offset: kwargs.offset || args[2],
      limit: kwargs.limit || args[3],
      sort: kwargs.order || args[4],
      context: kwargs.context,
    });
    return result.records;
  }

  mockSearchReadController(params: SearchReadControllerParams): SearchReadControllerReturnType {
    const model = this.models[params.model];
    let fieldNames = params.fields;
    const offset = params.offset || 0;
    if (!fieldNames || !fieldNames.length) {
      fieldNames = Object.keys(model.fields);
    }
    fieldNames = [...new Set(fieldNames.concat(["id"]))];
    let records = this.getRecords(params.model, params.domain || []);
    if (params.sort) {
      // warning: only consider first level of sort
      params.sort = params.sort.split(",")[0];
      const fieldName = params.sort.split(" ")[0];
      const order = params.sort.split(" ")[1] as "ASC" | "DESC" | undefined;
      records = this.sortByField(records, params.model, fieldName, order);
    }
    const nbRecords = records.length;
    records = records.slice(offset, params.limit ? offset + params.limit : nbRecords);
    return {
      length: nbRecords,
      records: this.mockRead(params.model, [records.map((r) => r.id), fieldNames]),
    };
  }

  mockWrite(modelName: string, args: WriteArgs): true {
    args[0].forEach((id) => this.writeRecord(modelName, args[1], id));
    return true;
  }

  //////////////////////////////////////////////////////////////////////////////
  // Private
  //////////////////////////////////////////////////////////////////////////////

  evaluateDomain(domain: Domain, record: DBRecord) {
    console.warn("MOCK SERVER: cannot evaluate domain yet");
    return true; // TODO
  }
  /**
   * Get all records from a model matching a domain.  The only difficulty is
   * that if we have an 'active' field, we implicitely add active = true in
   * the domain.
   */
  getRecords(modelName: string, domain: Domain, { active_test = true } = {}): DBRecord[] {
    if (!Array.isArray(domain)) {
      throw new Error("MockServer._getRecords: given domain has to be an array.");
    }
    const model = this.models[modelName];

    // add ['active', '=', true] to the domain if 'active' is not yet present in domain
    if (active_test && "active" in model.fields) {
      const activeInDomain = domain.some((subDomain) => subDomain[0] === "active");
      if (!activeInDomain) {
        domain = domain.concat([["active", "=", true]]);
      }
    }

    let records = model.records;
    if (domain.length) {
      // 'child_of' operator isn't supported by domain.js, so we replace
      // in by the 'in' operator (with the ids of children)
      domain = domain.map((criterion: any) => {
        if (criterion[1] === "child_of") {
          let oldLength = 0;
          const childIDs = [criterion[2]];
          while (childIDs.length > oldLength) {
            oldLength = childIDs.length;
            records.forEach((r) => {
              if (childIDs.indexOf(r.parent_id) >= 0) {
                childIDs.push(r.id);
              }
            });
          }
          criterion = [criterion[0], "in", childIDs];
        }
        return criterion;
      });
      records = records.filter((record) => this.evaluateDomain(domain, record));
    }

    return records;
  }

  sortByField(records: DBRecord[], modelName: string, fieldName: string, order?: "ASC" | "DESC") {
    const field = this.models[modelName].fields[fieldName];
    records.sort((r1, r2) => {
      let v1 = r1[fieldName];
      let v2 = r2[fieldName];
      if (field.type === "many2one") {
        const coRecords = this.models[field.relation!].records;
        if (this.models[field.relation!].fields.sequence) {
          // use sequence field of comodel to sort records
          v1 = coRecords.find((r) => r.id === v1[0])!.sequence;
          v2 = coRecords.find((r) => r.id === v2[0])!.sequence;
        } else {
          // sort by id
          v1 = v1[0];
          v2 = v2[0];
        }
      }
      if (v1 < v2) {
        return order === "ASC" ? -1 : 1;
      }
      if (v1 > v2) {
        return order === "ASC" ? 1 : -1;
      }
      return 0;
    });
    return records;
  }

  writeRecord(
    modelName: string,
    values: { [key: string]: any },
    id: number,
    { ensureIntegrity = true } = {}
  ) {
    const model = this.models[modelName];
    const record = model.records.find((r) => r.id === id) as DBRecord;
    for (const fieldName in values) {
      const field = model.fields[fieldName];
      let value = values[fieldName];
      if (!field) {
        throw Error(
          `Mock: Can't write value "${JSON.stringify(
            value
          )}" on field "${fieldName}" on record "${model},${id}" (field is undefined)`
        );
      }
      if (["one2many", "many2many"].includes(field.type)) {
        let ids = record[fieldName] ? record[fieldName].slice() : [];

        // fallback to command 6 when given a simple list of ids
        if (Array.isArray(value)) {
          if (value.reduce((hasOnlyInt, val) => hasOnlyInt && Number.isInteger(val), true)) {
            value = [[6, 0, value]];
          }
        }
        // interpret commands
        for (const command of value || []) {
          if (command[0] === 0) {
            // CREATE
            const newId = this.mockCreate(field.relation!, command[2]);
            ids.push(newId);
          } else if (command[0] === 1) {
            // UPDATE
            this.mockWrite(field.relation!, [[command[1]], command[2]]);
          } else if (command[0] === 2 || command[0] === 3) {
            // DELETE or FORGET
            ids.splice(ids.indexOf(command[1]), 1);
          } else if (command[0] === 4) {
            // LINK_TO
            if (!ids.includes(command[1])) {
              ids.push(command[1]);
            }
          } else if (command[0] === 5) {
            // DELETE ALL
            ids = [];
          } else if (command[0] === 6) {
            // REPLACE WITH
            // copy array to avoid leak by reference (eg. of default data)
            ids = [...command[2]];
          } else {
            throw Error(
              `Command "${JSON.stringify(
                value
              )}" not supported by the MockServer on field "${fieldName}" on record "${model},${id}"`
            );
          }
        }
        record[fieldName] = ids;
      } else if (field.type === "many2one") {
        if (value) {
          const relRecord = this.models[field.relation!].records.find((r) => r.id === value);
          if (!relRecord && ensureIntegrity) {
            throw Error(
              `Wrong id "${JSON.stringify(
                value
              )}" for a many2one on field "${fieldName}" on record "${model},${id}"`
            );
          }
          record[fieldName] = value;
        } else {
          record[fieldName] = false;
        }
      } else {
        record[fieldName] = value;
      }
    }
  }

  getUnusedID(modelName: string) {
    const model = this.models[modelName];
    return (
      model.records.reduce((max, record) => {
        if (!Number.isInteger(record.id)) {
          return max;
        }
        return Math.max(record.id, max);
      }, 0) + 1
    );
  }

  applyDefaults(model: ModelData, record: DBRecord) {
    record.display_name = record.display_name || record.name;
    for (const fieldName in model.fields) {
      if (fieldName === "id") {
        continue;
      }
      if (!(fieldName in record)) {
        if ("default" in model.fields[fieldName]) {
          const def = model.fields[fieldName].default;
          record[fieldName] = typeof def === "function" ? def.call(this) : def;
        } else if (["one2many", "many2many"].includes(model.fields[fieldName].type)) {
          record[fieldName] = [];
        } else {
          record[fieldName] = false;
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
// MockServer deployment helper
// -----------------------------------------------------------------------------

export function makeMockServer(
  config: TestConfig,
  serverData?: ServerData,
  mockRPC?: MockRPC
): void {
  serverData = serverData || {};
  const mockServer = new MockServer(serverData, {
    debug: QUnit.config.debug,
  });
  const _mockRPC: MockRPC = async (route, args = {}) => {
    let res;
    if (mockRPC) {
      res = await mockRPC(route, args);
    }
    if (res === undefined) {
      res = await mockServer.performRPC(route, args);
    }
    return res;
  };
  const rpcService = makeFakeRPCService(_mockRPC);
  config.browser = config.browser || {};
  config.browser.fetch = makeMockFetch(_mockRPC);
  config.services = config.services || new Registry<Service>();
  config.services.add("rpc", rpcService);
}
