
module.exports = LinkWriter

var fs = require("graceful-fs")
  , Writer = require("./writer.js")
  , inherits = require("inherits")
  , collect = require("./collect.js")
  , path = require("path")
  , rimraf = require("rimraf")

inherits(LinkWriter, Writer)

function LinkWriter (props) {
  var me = this
  if (!(me instanceof LinkWriter)) throw new Error(
    "LinkWriter must be called as constructor.")

  // should already be established as a Link type
  if (!((props.type === "Link" && props.Link) ||
        (props.type === "SymbolicLink" && props.SymbolicLink))) {
    throw new Error("Non-link type "+ props.type)
  }

  if (!props.linkpath) {
    me.error("Need linkpath property to create " + props.type)
  }

  Writer.call(this, props)
}

LinkWriter.prototype._create = function () {
  var me = this
    , hard = me.type === "Link"
    , link = hard ? "link" : "symlink"
    , lp = hard ? path.resolve(me.dirname, me.linkpath) : me.linkpath

  // links are cheap to create.  Just clobber them if necessary.
  if (me._old) rimraf(me.path, function (er) {
    if (er) return me.error(er)
    me._old = null
    me._create()
  })

  fs[link](lp, me.path, function (er) {
    if (er) return me.error(er)
    me._ready = true
    me.emit("ready")
  })
}

LinkWriter.prototype.end = function () {
  this._finish()
}
