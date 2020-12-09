import { Component } from "@odoo/owl";
import { Env } from "@odoo/owl/dist/types/component/component";
import { Type } from "../types";

export default class OdooError extends Error {
  public traceback?: string;
  public name: string;
  public Component?: Type<Component<any, Env>>;

  constructor(name: string) {
    super();
    this.name = name;
  }
}
