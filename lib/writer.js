
module.exports = Writer

var fs = require("graceful-fs")
  , Stream = require("stream").Stream
  , inherits = require("inherits")
  , rimraf = require("rimraf")
  , mkdir = require("mkdirp")
  , path = require("path")
  , umask = process.umask()
  , dirmode = 0777 & (~umask)
  , filemode = 0644 & (~umask)
  , proxyEvents = require("./proxy-events.js")
  , getType = require("./get-type.js")


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
  me.root = props.root || (props.parent && props.parent.root) || me
  me.path = props.path
  me.basename = path.basename(props.path)
  me.dirname = path.dirname(props.path)
  me.linkpath = props.linkpath || null
  me.size = props.size
  me._bytesWritten = 0

  if (typeof props.mode === "string") props.mode = parseInt(props.mode, 8)

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
                    wantedType === "SymbolicLink" ||
                    wantedType === "Link"
      , recreate = wantedType !== currentType

    Object.keys(current || {}).forEach(function (k) {
      if (!props.hasOwnProperty(k)) props[k] = current[k]
    })

    me._old = current

    if (!recreate) {
      if (wantedType == "File") create(me)
      else setProps(me, current)
      return
    }

    if ((wantedType === "SymbolicLink" || wantedType === "Link") &&
        !me.linkpath) {
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
  if (typeof me.props.mode !== "number") {
    me.props.mode = me.type === "Directory" ? dirmode : filemode
  }

  mkdir(me.dirname, dirmode, function (er) {
    if (er) return me.emit("error", me)

    switch (me.type) {
      case "Directory":
        mkdir(me.path, me.props.mode & 0777, next)
        break

      case "SymbolicLink":
        fs.symlink(me.linkpath, me.path, next)
        break

      case "Link":
        fs.link(me.linkpath, me.path, next)
        break

      case "File":
        var s = me._stream = fs.createWriteStream(me.path, me.props)
        proxyEvents(["open", "error", "drain", "close"], s, me)
        me._stream.on("open", function (fd) {
          next()
        })
        if (typeof me.size === "number") {
          me._stream.on("close", function () {
            if (me._bytesWritten !== me.size) {
              me.emit("error", new Error("Wrong byte count\n" +
                                         "Expected: " + me.size + "\n" +
                                         "Actual:   " + me._byteCount))
            }
          })
        }
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
  var done = false

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
  if (typeof me.props.uid === "number" ||
      typeof me.props.gid === "number") {
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
      if (me._stream) {
        // can't set them now, since we'll be touching the file.
        me._stream.on("end", setTimes)
        me._stream.on("close", setTimes)
      } else {
        todo ++
        setTimes()
      }
    }

    function setTimes () {
      fs.utimes(me.path, meA, meM, next)
    }
  }

  // finally, handle the case if there was nothing to do.
  if (todo === 0) next()

  function next (er) {
    if (errState) return
    if (er) return me.emit("error", errState = er)
    if (--todo > 0) return
    if (done) return

    done = true

    // all the props have been set, now see if we got any pending writes
    // in the meantime.
    me._ready = true
    me.emit("stat", me.props)

    var buffer = me._buffer
    if (buffer.length) {
      me._buffer = []
      buffer.forEach(function (c) {
        me[c[0]](c[1])
      })
    }
  }
}

function objectToString (d) {
  return Object.prototype.toString.call(d)
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

  if (typeof c === "string") c = new Buffer(c)
  if (!Buffer.isBuffer(c)) {
    me.emit("error", new Error("can only write strings or buffers"))
    return
  }

  me._bytesWritten += c.length
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

  // if we have an entry that we're currently working on, then
  // queue this one up for later.
  if (me._currentEntry) {
    me._buffer.push(["add", entry])
    me._needsDrain = true
    return false
  }

  // ok, add this entry, then!
  var p = entry
  // don't allow recursive copying!
  do {
    // console.error("resursive?", p.path, me.path, p.path === me.path)
    if (p.path === me.path) return
  } while (p = p.parent)

  // chop the entry's parent's dir
  var opts = { parent: me
             , root: me.root || me
             , type: entry.type
             , depth: me.depth + 1 }

  var p = entry.path || entry.props.path
    , root = entry.root || entry.parent
  if (root) {
    p = p.substr(root.path.length + 1)
  }
  opts.path = path.join(me.path, p)

  // all the rest of the stuff, copy over from the source.
  Object.keys(entry.props).forEach(function (k) {
    if (!opts.hasOwnProperty(k)) {
      opts[k] = entry.props[k]
    }
  })

  var child = new Writer(opts)
  // directories are already handled, since their entries bubble up.
  if (entry.type !== "Directory") {
    entry.pipe(child)
  }

  child.on("entry", function (entry) {
    me.emit("entry", entry)
  })

  child.on("stat", function () {
    me.emit("entry", child)
  })
}


Writer.prototype.end = function (c) {
  var me = this

  if (!me._ready || me._buffer.length) {
    me._buffer.push(["end", c])
    me._needsDrain = true
    return false
  }

  if (c) me.write(c)
  if (me._stream) me._stream.end()
  me._ended = true
}
