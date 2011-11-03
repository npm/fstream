
module.exports = LinkWriter

var fs = require("graceful-fs")
  , fstream = require("../fstream.js")
  , Writer = fstream.Writer
  , inherits = require("inherits")
  , collect = require("./collect.js")

inherits(LinkWriter, Writer)

function LinkWriter (props) {
  var me = this
  if (!(me instanceof LinkWriter)) throw new Error(
    "LinkWriter must be called as constructor.")

  // should already be established as a Link type
  if (!(props.type === "Link" && props.Link) ||
      !(props.type === "SymbolicLink" && props.SymbolicLink)) {
    throw new Error("Non-link type "+ props.type)
  }

  if (!props.linkpath) {
    me.emit("error", new Error(
      "Need linkpath property to create " + props.type))
  }

  Writer.call(this, props)
}

LinkWriter.prototype._create = function () {
  var me = this
    , link = me.type === "Link" ? "link" : "symlink"
  fs[link](me.linkpath, me.path, function (er) {
    if (er) return me.emit("error", er)
    me._ready = true
    me.emit("ready")
  })
}

LinkWriter.prototype.end = function () {
  this._finish()
}
