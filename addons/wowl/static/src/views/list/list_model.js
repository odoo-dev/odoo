/** @odoo-module **/
export class ListModel {
  constructor(model, modelName, fields) {
    this.records = [];
    this._modelService = model;
    this.modelName = modelName;
    this.fields = fields;
    this.columns = this.fields
      .filter((f) => !f.invisible && f.optional !== "hide")
      .map((f) => f.name);
  }
  async load(domain, options = {}) {
    const fields = this.fields
      .filter((f) => !f.invisible && f.optional !== "hide")
      .map((f) => f.name);
    const result = await this._modelService(this.modelName).webSearchRead(domain, fields, {
      limit: options.limit,
    });
    this.records = result.records;
  }
}
