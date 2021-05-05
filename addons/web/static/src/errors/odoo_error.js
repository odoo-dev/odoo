/** @odoo-module **/

export class ConnectionLostError extends Error {
  constructor() {
    super(...arguments);
    this.name = "CONNECTION_LOST_ERROR";
  }
}

export class ControllerNotFoundError extends Error {
  constructor() {
    super(...arguments);
    this.name = "CONTROLLER_NOT_FOUND_ERROR";
  }
}

export class RPCError extends Error {
  constructor() {
    super(...arguments);
    this.name = "RPC_ERROR";
    this.type = "server";
  }
}

export class UncaughtClientError extends Error {
  constructor() {
    super(...arguments);
    this.name = "UNCAUGHT_CLIENT_ERROR";
  }
}

export class UnknownCorsError extends Error {
  constructor() {
    super(...arguments);
    this.name = "UNKNOWN_CORS_ERROR";
  }
}

export class UncaughtEmptyRejectionError extends Error {
  constructor() {
    super(...arguments);
    this.name = "UNCAUGHT_EMPTY_REJECTION_ERROR";
  }
}

export class UncaughtObjectRejectionError extends Error {
  constructor() {
    super(...arguments);
    this.name = "UNCAUGHT_OBJECT_REJECTION_ERROR";
  }
}
export class ViewNotFoundError extends Error {
  constructor() {
    super(...arguments);
    this.name = "VIEW_NOT_FOUND_ERROR";
  }
}
