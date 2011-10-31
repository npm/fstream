
exports.Reader = Reader
exports.Writer = Writer

var fs = require("graceful-fs")
  , Stream = require("stream").Stream
  , inherits = require("inherits")
  , rimraf = require("rimraf")
  , mkdir = require("mkdirp")

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
  me.path = opts.path

  fs[stat](me.path, function (er, props) {
    if (er) return me.emit("error", er)
    me.props = props
    me.type = getType(props)
    me.emit("stat", props)

    if (me.filter) {
      var ret = me.filter(props)
      if (!ret) return me.emit("end")
    }

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
                       , parent: me })

      fst.on("error", function (e) {
        me.emit("error", e)
      })

      fst.on("props", function (p) {
        me.emit("entry", fst)
      })

      fst.on("end", function () {
        f ++
        walk()
      })
    })()
  })
}

function proxyEvents (evs, from, to) {
  evs.forEach(function (ev) {
    from.on(ev, function () {
      var l = arguments.length
        , args = new Array(l + 1)
      args[0] = ev
      for (var i = 0, l = arguments.length; i < l; i ++) {
        args[i + 1] = arguments[i]
      }
      to.emit.apply(to, args)
    })
  })
}

Reader.prototype.pipe = function (dest, opts) {
  if (this.type === "Directory" && typeof dest.add === "function") {
    // piping to a multi-compatible, and we've got directory entries.
    this.on("entry", function (entry) {
      dest.add(entry)
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


function Writer (props) {
  var me = this
  if (!(me instanceof Writer)) return new Writer(props)
  Stream.call(me)

  if (typeof props === "string") {
    props = { path: props }
  }

  if (!props.path) {
    me.emit("error", new Error("Must provide a path"))
    return
  }

  me.props = props
  me.depth = props.depth || 0
  me.clobber = false === props.clobber ? props.clobber : true
  me.parent = props.parent || null
  me.path = props.path
  me.linkpath = props.linkpath || null

  me.readable = false
  me.writable = true

  // buffer until stat
  me._buffer = []
  me._ready = false

  var stat = props.follow ? "stat" : "lstat"

  fs[stat](props.path, function (er, current) {
    // if it's not there, great.  We'll just create it.
    // if it is there, then we'll need to change whatever differs
    // if we can't modify what needs modifying, then error on it.

    // try to figure out what kind of type it is.
    // We can actually only create directories, files, and symlinks,
    // so if it's a block/character device or fifo, then abort.
    // However, if it's a fifo or device or socket, and we're not
    // *changing* it, then that's fine, since we might just be writing
    // data into it.
    //
    // If it wants to be a directory or file or symlink, and is currently
    // anything else, then clobber it.
    var changeType = true
      , currentType = current ? getType(current) : null
      , wantedType = me.type = getType(props) || currentType || "File"
      , creatable = wantedType === "Directory" ||
                    wantedType === "File" ||
                    wantedType === "SymbolicLink"
      , recreate = wantedType !== currentType

    Object.keys(current || {}).forEach(function (k) {
      if (!props.hasOwnProperty(k)) props[k] = current[k]
    })

    me._old = current

    if (!recreate) {
      setProps(me, current)
      return
    }

    if (wantedType === "SymbolicLink" && !me.linkpath) {
      return me.emit("error", new Error(
        "Cannot create symlink without linkpath"))
    }

    if (!creatable) {
      return me.emit("error", new Error(
        "Cannot create filetype: " + wantedType))
    }

    clobber(me)
  })
}

inherits(Writer, Stream)

function clobber (me) {
  rimraf(me.path, function (er) {
    if (er) return me.emit("error", er)
    create(me)
  })
}

function create (me) {
  mkdir(path.dirname(me.path), me.mode & 0777, function (er) {
    if (er) return me.emit("error", me)

    switch (me.type) {
      case "Directory":
        mkdir(me.path, me.mode & 0777, next)
        break

      case "SymbolicLink":
        fs.symlink(me.path, me.linkpath, next)
        break

      case "File":
        me._stream = fs.createWriteStream(me.path, me.props)
        me._stream.on("open", function (fd) {
          next()
        })
        break

      default:
        return me.emit("error", new Error("Cannot create type: "+me.type))
    }
  })

  function next (er) {
    if (er) return me.emit("error", er)
    fs[me.follow ? "stat" : "lstat"](me.path, function (er, stat) {
      if (er) return me.emit("error", er)
      me._old = stat
      setProps(me, stat)
    })
  }
}

function setProps (me, current) {
  // set up all the things.
  var todo = 0
  var errState = null

  // mode
  var wantMode = me.props.mode
  if (typeof wantMode === "number") {
    wantMode = wantMode & 0777
    var curMode = current.mode & 0777
    if (wantMode !== curMode) {
      todo ++
      if (me._stream && me._stream.fd && fs.fchmod) {
        fs.fchmod(me._stream.fd, wantMode, next)
      } else {
        fs.chmod(me.path, wantMode, next)
      }
    }
  }

  // uid, gid
  if (typeof me.props.uid === "number" || typeof me.props.gid === "number") {
    if (typeof me.props.uid !== "number") me.props.uid = current.uid
    if (typeof me.props.gid !== "number") me.props.gid = current.gid
    if (me.props.uid !== current.uid || me.props.gid !== current.gid) {
      todo ++
      if (me._stream && me._stream.fd && fs.fchown) {
        fs.fchown(me._stream.fd, me.props.uid, me.props.gid, next)
      } else {
        fs.chown(me.path, me.props.uid, me.props.gid, next)
      }
    }
  }

  // atime, mtime.
  if (fs.utimes) {
    var curA = current.atime
      , curM = current.mtime
      , meA = me.props.atime
      , meM = me.props.mtime

    if (meA === undefined) meA = curA
    if (meM === undefined) meM = curM

    if (!isDate(meA)) meA = new Date(meA)
    if (!isDate(meM)) meA = new Date(meM)

    if (meA.getTime() !== curA.getTime() ||
        meM.getTime() !== curM.getTime()) {
      todo ++
      if (me._stream && me._stream.fd && fs.futimes) {
        fs.futimes(me._stream.fd, meA, meM, next)
      } else {
        fs.utimes(me.path, meA, meM, next)
      }
    }
  }

  // finally, handle the case if there was nothing to do.
  if (todo === 0) next()

  function next (er) {
    if (errState) return
    if (er) return me.emit("error", errState = er)
    if (--todo > 0) return

    // all the props have been set, now see if we got any pending writes
    // in the meantime.
    me._ready = true
    var buffer = me._buffer
    if (buffer.length) {
      me.buffer = []
      buffer.forEach(function (c) {
        me[c[0]](c[1])
      })
    }
  }
}

function isDate(d) {
  return typeof d === 'object' && objectToString(d) === '[object Date]';
}

Writer.prototype.pipe = function () {
  this.emit("error", new Error("Can't pipe from writable stream"))
}

Writer.prototype.write = function (c) {
  var me = this

  if (me._ended) {
    me.emit("error", new Error("write after end"))
    return false
  }

  if (!me._ready || me._buffer.length) {
    me._buffer.push(["write", c])
    me._needsDrain = true
    return false
  }

  if (me.type !== "File") {
    // just ignore writes to non-File types.
    // some tar entries contain metadata for directories
    return true
  }

  return me._stream.write(c)
}

// create a subfolder underneath this one
Writer.prototype.add = function (entry) {
  var me = this

  if (me._ended) {
    me.emit("error", new Error("add after end"))
    return false
  }

  if (!me._ready || me._buffer.length) {
    me._buffer.push(["add", entry])
    me._needsDrain = true
    return false
  }

  if (me._ended) {
    me.emit("error", new Error("write after end"))
    return false
  }

  if (me.type !== "Directory") {
    // can't add sub-entries to a non-dir type
    me.emit("error", new Error("can't add to non-Directory type"))
    return
  }

  entry.path = path.join(me.path, entry.path)
  entry.parent = me
  entry.depth = me.depth + 1

  entry = new Writer(entry)
  me.emit("entry", entry)
}


Writer.prototype.end = function (c) {
  var me = this
  if (c) me.write(c)
  if (me._stream) me._stream.end()
  me._ended = true
}



function getType (st) {
  var types =
      [ "Directory"
      , "File"
      , "SymbolicLink"
      , "BlockDevice"
      , "CharacterDevice"
      , "FIFO"
      , "Socket" ]
    , type

  for (var i = 0, l = types.length; i < l; i ++) {
    type = types[i]
    var is = st[type] || st["is" + type]
    if (typeof is === "function") is = is()
    if (is) {
      st[type] = true
      st.type = type
      return type
    }
  }

  return null
}
