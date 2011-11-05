
module.exports = Writer

var fs = require("graceful-fs")
  , Stream = require("stream").Stream
  , inherits = require("inherits")
  , rimraf = require("rimraf")
  , mkdir = require("mkdirp")
  , path = require("path")
  , umask = process.umask()
  , getType = require("./get-type.js")

// Must do this *before* loading the child classes
inherits(Writer, Stream)

Writer.dirmode = 0777 & (~umask)
Writer.filemode = 0666 & (~umask)

var DirWriter = require("./dir-writer.js")
  , LinkWriter = require("./link-writer.js")
  , FileWriter = require("./file-writer.js")
  , ProxyWriter = require("./proxy-writer.js")

// props is the desired state.  current is optionally the current stat,
// provided here so that subclasses can avoid statting the target
// more than necessary.
function Writer (props, current) {
  var me = this

  if (typeof props === "string") {
    props = { path: props }
  }

  if (!props.path) throw new Error("Must provide a path")

  // polymorphism.
  // call fstream.Writer(dir) to get a DirWriter object, etc.
  var type = getType(props)
    , ClassType = Writer

  switch (type) {
    case "Directory":
      ClassType = DirWriter
      break
    case "File":
      ClassType = FileWriter
      break
    case "Link":
    case "SymbolicLink":
      ClassType = LinkWriter
      break
    case null:
      // Don't know yet what type to create, so we wrap in a proxy.
      ClassType = ProxyWriter
      break
  }

  if (!(me instanceof ClassType)) return new ClassType(props)

  console.error("Writer<%s>", ClassType.name, props.path)


  // now get down to business.

  Stream.call(me)

  // props is what we want to set.
  // set some convenience properties as well.
  me.type = props.type
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

  if (typeof props.mode === "string") {
    props.mode = parseInt(props.mode, 8)
  }

  me.readable = false
  me.writable = true

  // buffer until ready, or while handling another entry
  me._buffer = []
  me._ready = false

  // start the ball rolling.
  // this checks what's there already, and then calls
  // me._create() to call the impl-specific creation stuff.
  me._stat(current)
}

Writer.prototype.warn = function (msg, code) {
  var me = this
  if (!me.listeners("warn")) {
    if (code) console.error(code)
    console.error(msg)
  } else {
    var er = new Error(msg)
    er.errno = er.code = code
    me.emit("warn", er)
  }
}

// Calling this means that it's something we can't create.
// Just assert that it's already there, otherwise raise a warning.
Writer.prototype._create = function () {
  var me = this
  fs[me.props.follow ? "stat" : "lstat"](me.path, function (er, current) {
    if (er) {
      return me.warn("Cannot create " + me.path + "\n" +
                     "Unsupported type: "+me.type, "ENOTSUP")
    }
    me._finish()
  })
}

Writer.prototype._stat = function (current) {
  var me = this
    , props = me.props
    , stat = props.follow ? "stat" : "lstat"

  if (current) statCb(null, current)
  else fs[stat](props.path, statCb)

  function statCb (er, current) {
    // if it's not there, great.  We'll just create it.
    // if it is there, then we'll need to change whatever differs
    if (er || !current) return create(me)

    me._old = current
    var currentType = getType(current)

    // if it's a type change, then we need to clobber or error.
    // if it's not a type change, then let the impl take care of it.
    if (currentType !== me.type) {
      return rimraf(me.path, function (er) {
        if (er) return me.emit("error", er)
        create(me)
      })
    }
    return create(me)
  }
}

function create (me) {
  mkdir(path.dirname(me.path), Writer.dirmode, function (er) {
    if (er) return me.emit("error", er)
    me._create()
  })
}

Writer.prototype._finish = function () {
  var me = this

  // set up all the things.
  // At this point, we're already done writing whatever we've gotta write,
  // adding files to the dir, etc.
  var todo = 0
  var errState = null
  var done = false

  if (me._old) {
    // the times will almost *certainly* have changed.
    // adds the utimes syscall, but remove another stat.
    me._old.atime = new Date(0)
    me._old.mtime = new Date(0)
    setProps(me._old)
  } else {
    var stat = me.props.follow ? "stat" : "lstat"
    fs[stat](me.path, function (er, current) {
      if (er) return me.emit("error", er)
      setProps(me._old = current)
    })
  }

  return

  function setProps (current) {
    // mode
    var wantMode = me.props.mode
    if (fs.chmod && typeof wantMode === "number") {
      wantMode = wantMode & 0777
      todo ++
      fs.chmod(me.path, wantMode, next)
    }

    // uid, gid
    if (typeof me.props.uid === "number" ||
        typeof me.props.gid === "number") {
      if (typeof me.props.uid !== "number") me.props.uid = current.uid
      if (typeof me.props.gid !== "number") me.props.gid = current.gid
      if (me.props.uid !== current.uid || me.props.gid !== current.gid) {
        todo ++
        fs.chown(me.path, me.props.uid, me.props.gid, next)
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
        fs.utimes(me.path, meA, meM, next)
      }
    }

    // finally, handle the case if there was nothing to do.
    if (todo === 0) next()
  }

  function next (er) {
    // console.error("  FINISH HIM!", me.path)
    if (errState) return
    if (er) return me.emit("error", errState = er)
    if (--todo > 0) return
    if (done) return
    done = true

    // all the props have been set, so we're completely done.
    me.emit("end")
  }
}

Writer.prototype.pipe = function () {
  this.emit("error", new Error("Can't pipe from writable stream"))
}

Writer.prototype.add = function () {
  this.emit("error", new Error("Cannot add to non-Directory type"))
}

Writer.prototype.write = function () {
  return true
}

function objectToString (d) {
  return Object.prototype.toString.call(d)
}

function isDate(d) {
  return typeof d === 'object' && objectToString(d) === '[object Date]';
}

