# semantic
t-ref changes: takes a signal (or resource) | 1022 calls
t-model changes: takes a signal | 197 calls

onWillUpdateProps removed | 183 calls
useComponent removed | 93 calls
onWillRender removed | 70 calls
onRendered removed | 20 calls

## props
this.props removed
static props / defaultprops ignored (use the props function) | 281 default props

## Plugin
- all services to plugins
- this.env removed (a lot) calls
- useSubEnv (161) calls






## after owl 3merge
- change methods in compute
## ?
- this.render removed | 130 calls | render(this) in owl2'
- [?] t-portal removed | 18 calls
# rename
useState removed
reactive removed | 240 calls
useExternalListener renamed to useListener (and changed) | 210 calls
t-call not allowed on tags !== t
t-call body evaluated lazily, variables passed as parameters
- t-set t-value should be argument
t-esc removed
rendering context changes (reading from component through this)

# ?
- [x] App has only sub roots | 20 new App calls
- [x] loadFile removed

