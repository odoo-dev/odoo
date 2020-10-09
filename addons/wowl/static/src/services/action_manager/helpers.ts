import { Component } from "@odoo/owl";
import { OdooEnv, Type } from "./../../types";

type ActionId = number;
type ActionXMLId = string;
type ActionTag = string;
interface ActionDescription {
  tag: string;
  type: "ir.actions.client";
  [key: string]: any;
}
export type ActionRequest = ActionId | ActionXMLId | ActionTag | ActionDescription;
export interface ActionOptions {
  clear_breadcrumbs?: boolean;
}

type ActionType =
  | "ir.actions.act_url"
  | "ir.actions.act_window"
  | "ir.actions.act_window_close"
  | "ir.actions.client"
  | "ir.actions.report"
  | "ir.actions.server";
export interface Action {
  id?: number;
  jsId: string;
  context: object;
  target: "current";
  type: ActionType;
}
export interface ClientAction extends Action {
  Component?: Type<Component<{}, OdooEnv>>;
  tag: string;
  type: "ir.actions.client";
}
export interface ActWindowAction extends Action {
  Component: Type<Component<{}, OdooEnv>>;
  id: number;
  type: "ir.actions.act_window";
  res_model: string;
}
export interface ServerAction extends Action {
  id: number;
  type: "ir.actions.server";
}

// function makeStandardAction(action: ActionRequest, options:ActionOptions): ClientAction {
//   action = Object.assign({}, action);
//   action.jsId = ++actionId;
//   // LPE FIXME
//   // ensure that the context and domain are evaluated
//   //var context = new Context(this.env.session.user_context, options.additional_context, action.context);
//   //action.context = pyUtils.eval('context', context);
//   //if (action.domain) {
//   //    action.domain = pyUtils.eval('domain', action.domain, action.context);
//   //}
//   // action._originalAction = JSON.stringify(action);
//   return action;
// }
