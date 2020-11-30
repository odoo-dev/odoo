import { Component } from "@odoo/owl";
import { Registry } from "../core/registry";
import { Type } from "../types";
import { LoadingIndicator } from "./loading_indicator/loading_indicator";

// -----------------------------------------------------------------------------
// Main Components
// -----------------------------------------------------------------------------

// Components registered in this registry will be rendered inside the root node
// of the webclient.
export const mainComponentRegistry: Registry<Type<Component>> = new Registry();

mainComponentRegistry.add("LoadingIndicator", LoadingIndicator);
