# Bus

The web client `env` contains an event bus, named `bus`. Its purpose is to allow
various parts of the system to properly coordinate themselves, without coupling
them. The `env.bus` is an owl `EventBus`, that should be used for global events
of interest.

## Message List

| Message                   | Payload                                   | Triggered when:                                                                                                        |
| ------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ROUTE_CHANGE`            | none                                      | the url hash was changed                                                                                               |
| `NOTIFICATIONS_CHANGE`    | list of notifications                     | the list of notifications changes                                                                                      |
| `RPC_ERROR`               | error data object                         | a rpc request (going through `rpc` service) fails                                                                      |
| `action_manager:update`   | list of descriptors of the user interface | the action manager has finished computing the next interface                                                           |
| `action_manager:finalize` | none                                      | the next interface has finished rendering, the action manager should commit it in its state. Its use is very sensitive |
