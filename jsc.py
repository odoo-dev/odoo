import gi
try:
    gi.require_version('JavaScriptCore', '6.0')
except ValueError:
    gi.require_version('JavaScriptCore', '4.1')

from gi.repository import JavaScriptCore, GObject
print("*******************")
context = JavaScriptCore.Context()
print(context.evaluate('1 + 2', -1).to_string())