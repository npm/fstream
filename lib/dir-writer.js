// It is expected that, when .add() returns false, the consumer
// of the DirWriter will pause until a "drain" event occurs. Note
// that this is *almost always going to be the case*, unless the
// thing being written is some sort of unsupported type, and thus
// skipped over.

module.exports = DirWriter

var fs = require("graceful-fs")
  , fstream = require("../fstream.js")
  , Writer = require("./writer.js")
  , inherits = require("inherits")
  , mkdir = require("mkdirp")
  , path = require("path")
  , collect = require("./collect.js")

inherits(DirWriter, Writer)

function DirWriter (props) {
  var me = this
  if (!(me instanceof DirWriter)) throw new Error(
    "DirWriter must be called as constructor.")

  // should already be established as a Directory type
  if (props.type !== "Directory" || !props.Directory) {
    throw new Error("Non-directory type "+ props.type + " " +
                    JSON.stringify(props))
  }

  Writer.call(this, props)
}

DirWriter.prototype._create = function () {
  var me = this
  mkdir(me.path, Writer.dirmode, function (er) {
    if (er) return me.emit("error", er)
    // ready to start getting entries!
    me._ready = true
    me.emit("ready")
  })
}

// a DirWriter has an add(entry) method, but its .write() doesn't
// do anything.  Why a no-op rather than a throw?  Because this
// leaves open the door for writing directory metadata for
// gnu/solaris style dumpdirs.
DirWriter.prototype.write = function () {
  return true
}

DirWriter.prototype.end = function () {
  this._ended = true
  this._process()
}

DirWriter.prototype.add = function (entry) {
  var me = this

  collect(entry)
  if (!me._ready || me._currentEntry) {
    me._buffer.push(entry)
    return false
  }

  // create a new writer, and pipe the incoming entry into it.
  if (me._ended) {
    return me.emit("error", new Error("add after end"))
  }

  me._buffer.push(entry)
  me._process()

  return 0 === this._buffer.length
}

DirWriter.prototype._process = function () {
  var me = this

  if (me._processing) return

  var entry = me._buffer.shift()
  if (!entry) {
    me.emit("drain")
    if (me._ended) me._finish()
    return
  }

  me._processing = true

  // ok, add this entry
  //
  // don't allow recursive copying
  var p = entry
  do {
    if (p.path === me.root.path || p.path === me.path) {
      me._processing = false
      if (entry._collected) entry.pipe()
      return me._process()
    }
  } while (p = p.parent)

  // chop off the entry's root dir, replace with ours
  var props = { parent: me
              , root: me.root || me
              , type: entry.type
              , depth: me.depth + 1 }

  var p = entry.path || entry.props.path
  if (entry.parent) {
    p = p.substr(entry.parent.path.length + 1)
  }
  // get rid of any ../../ shenanigans
  props.path = path.join(me.path, path.join("/", p))

  // all the rest of the stuff, copy over from the source.
  Object.keys(entry.props).forEach(function (k) {
    if (!props.hasOwnProperty(k)) {
      props[k] = entry.props[k]
    }
  })

  // not sure at this point what kind of writer this is.
  var child = me._currentChild = new Writer(props)
  child.on("ready", function () {
    entry.pipe(child)
    entry.resume()
  })

  child.on("end", onend)
  child.on("close", onend)
  function onend () {
    if (me._currentChild !== child) return
    me._currentChild = null
    me._processing = false
    me._process()
  }
}
