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
    if (code) console.error(code)
    console.error(msg)
  } else {
    var er = new Error(msg)
    er.errno = er.code = code
    er.path = er.path || this.path
    er.fstream_type = this.type
    er.fstream_path = this.path
    er.fstream_ctor = this.constructor.name
    me.emit("warn", er)
  }
}

Abstract.prototype.info = function (msg, code) {
  var me = this
  if (!me.listeners("info")) return
  me.emit("info", msg, code)
}

Abstract.prototype.error = function (msg, code, th) {
  var er = (msg instanceof Error) ? msg : new Error(msg)
  er.code = er.code || code
  er.path = er.path || this.path
  er.fstream_type = this.type
  er.fstream_path = this.path
  er.fstream_ctor = this.constructor.name
  if (th) throw er
  else this.emit("error", er)
}
