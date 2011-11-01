
module.exports = Reader

var fs = require("graceful-fs")
  , Stream = require("stream").Stream
  , inherits = require("inherits")
  , rimraf = require("rimraf")
  , mkdir = require("mkdirp")
  , path = require("path")
  , proxyEvents = require("./proxy-events.js")
  , getType = require("./get-type.js")

function Reader (opts) {
  if (typeof opts === "string") opts = { path: opts }

  var me = this
  if (!(me instanceof Reader)) return new Reader(opts)
  Stream.call(me)
  me.readable = true
  me.writable = false

  if (!opts.path) {
    return me.emit("error", new Error("path option is required"))
  }

  var stat = opts.follow ? "stat" : "lstat"
  me.filter = typeof opts.filter === "function" ? opts.filter : null
  me.depth = opts.depth || 0
  me.parent = opts.parent || null
  me.root = opts.root || (opts.parent && opts.parent.root) || me
  me.path = opts.path
  me.basename = path.basename(opts.path)
  me.dirname = path.dirname(opts.path)

  fs[stat](me.path, function (er, props) {
    if (er) return me.emit("error", er)
    me.props = props
    me.type = getType(props)

    // if the filter doesn't pass, then just skip over this one.
    // still have to emit end so that dir-walking can move on.
    if (me.filter) {
      var ret = me.filter()
      if (!ret) return me.emit("end")
    }

    me.emit("stat", props)

    // if it's a directory, then we'll be emitting "file" events.
    if (props.isDirectory()) {
      dirWalk(me)
      return
    } else if (props.isSymbolicLink()) {
      readlink(me)
      return
    }

    // TODO: special handling for character devices, block devices,
    // FIFO's, sockets.  They stat as size=0, but emit all sorts of data.

    // if it's got a zero-size, then just emit "end" right now
    if (props.size === 0) {
      me.emit("end")
      return
    }

    // otherwise, set up a readable stream for it.
    // TODO: Check that the bytesEmitted at the end matches
    // the expected size.
    var s = me._stream = fs.createReadStream(me.path, opts)
    proxyEvents(["open", "error", "data", "end", "close"], s, me)
  })
}

inherits(Reader, Stream)

function readlink (me) {
  fs.readlink(me.path, function (er, lp) {
    if (er) return me.emit("error", er)
    me.emit("linkpath", lp)
    me.emit("end")
  })
}

function dirWalk (me) {
  fs.readdir(me.path, function (er, entries) {
    if (er) return me.emit("error", er)
    me.emit("entries", entries)

    // now, go through all the entries and create Readers for them
    // Use the same filter, if one was provided, so that we don't
    // dive into directories that are excluded.
    var len = entries.length
      , f = 0

    ;(function walk () {
      if (f === len) return me.emit("end")
      var fst = Reader({ path: path.resolve(me.path, entries[f])
                       , filter: me.filter
                       , depth: me.depth + 1
                       , root: me.root
                       , parent: me })

      // treat the child entry as the underlying stream,
      // so that pause/resume is propagated properly
      me._stream = fst

      fst.on("error", function (e) {
        me.emit("error", e)
      })

      fst.on("stat", function (p) {
        me.emit("entry", fst)
      })

      // bubble up
      fst.on("entry", function (entry) {
        me.emit("entry", entry)
      })

      fst.on("end", function () {
        me._stream = null
        f ++
        walk()
      })
    })()
  })
}


Reader.prototype.pipe = function (dest, opts) {
  var me = this
  if (typeof dest.add === "function") {
    // piping to a multi-compatible, and we've got directory entries.
    me.on("entry", function (entry) {
      if (false === dest.add(entry)) me.pause()
    })
  }

  Stream.prototype.pipe.apply(this, arguments)
}

Reader.prototype.pause = function () {
  if (this._stream) this._stream.pause()
}

Reader.prototype.resume = function () {
  if (this._stream) this._stream.resume()
}
