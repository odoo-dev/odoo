type ActionId = number;
type ActionXMLId = string;
type ActionTag = string;
export type ActionRequest = ActionId | ActionXMLId | ActionTag;

export interface ActionOptions {}

export interface Action {
  jsId: string;
  target: "current";
  type: "ir.actions.client";
}

export interface ClientAction extends Action {
  tag: string;
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
