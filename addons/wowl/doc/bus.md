# Bus

The web client `env` contains an event bus, named `bus`. Its purpose is to allow
various parts of the system to properly coordinate themselves, without coupling
them. The `env.bus` is an owl `EventBus`, that should be used for global events
of interest.

## Message List

| Message                     | Payload                                                                                     | Triggered when:                                                         | Addon |
| --------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----- |
| `ROUTE_CHANGE`              | none                                                                                        | the url hash was changed                                                | wowl  |
| `NOTIFICATIONS_CHANGE`      | list of notifications                                                                       | the list of notifications changes                                       | wowl  |
| `RPC_ERROR`                 | error data object                                                                           | a rpc request (going through `rpc` service) fails                       | wowl  |
| `ACTION_MANAGER:UPDATE`     | next rendering info                                                                         | the action manager has finished computing the next interface            | wowl  |
| `ACTION_MANAGER:UI-UPDATED` | a mode indicating what part of the ui has been updated, and the corresponding action object | the rendering of the action requested to the action manager is rendered | wowl  |
| `MENUS:APP-CHANGED`         | none                                                                                        | the menu service's current app has changed                              | wowl  |
