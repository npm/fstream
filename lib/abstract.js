// the parent class for all fstreams.

module.exports = Abstract

var Stream = require("stream").Stream
  , inherits = require("inherits")

function Abstract () {
  Stream.call(this)
}

inherits(Abstract, Stream)

Abstract.prototype.warn = function (msg, code) {
  var me = this
  if (!me.listeners("warn")) {
    console.error("%s %s", msg, code || "UNKNOWN")
  } else {
    me.emit("warn", decorate(msg, code, this))
  }
}

Abstract.prototype.info = function (msg, code) {
  var me = this
  if (!me.listeners("info")) return
  me.emit("info", msg, code)
}

Abstract.prototype.error = function (msg, code, th) {
  var er = decorate(msg, code, this)
  if (th) throw er
  else this.emit("error", er)
}

function decorate (er, code, me) {
  if (!(er instanceof Error)) er = new Error(er)
  er.code = er.code || code
  er.path = er.path || me.path
  er.fstream_type = me.type
  er.fstream_path = me.path
  er.fstream_class = me.constructor.name
  er.fstream_stack = new Error().stack.split(/\n/).slice(3)
  return er
}
