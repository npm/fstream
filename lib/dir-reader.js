// A thing that emits "entry" events with Reader objects
// Pausing it causes it to stop emitting entry events, and also
// pauses the current entry if there is one.

module.exports = DirReader

var fs = require("graceful-fs")
  , fstream = require("../fstream.js")
  , Reader = fstream.Reader
  , inherits = require("inherits")
  , mkdir = require("mkdirp")
  , path = require("path")
  , Reader = require("./reader.js")

inherits(DirReader, Reader)

function DirReader (props) {
  var me = this
  if (!(me instanceof DirReader)) throw new Error(
    "DirReader must be called as constructor.")

  // should already be established as a Directory type
  if (props.type !== "Directory" || !props.Directory) {
    throw new Error("Non-directory type "+ props.type)
  }

  me._entries = null
  me._index = -1
  me._paused = false
  me._length = -1

  // me._read = function () {
  //   process.nextTick(DirReader.prototype._read.bind(me))
  // }
  Reader.call(this, props)
}

DirReader.prototype._getEntries = function () {
  var me = this
  fs.readdir(me.path, function (er, entries) {
    if (er) return me.emit("error", er)
    me._entries = entries
    me._length = entries.length
    me._read()
  })
}

// start walking the dir, and emit an "entry" event for each one.
DirReader.prototype._read = function () {
  var me = this

  if (!me._entries) return me._getEntries()

  console.error("\n\nDIRREADERREAD")
  if (me._paused || me._currentEntry) {
    console.error(" (oh, i see you're busy)")
    return
  }

  me._index ++
  console.error("\n\nDirReader %s[%d]=%j",
                me.path, me._index, me._entries[me._index])

  if (me._index >= me._length) {
    return me.emit("end")
  }

  // ok, handle this one, then.

  // save creating a proxy, by stat'ing the thing now.
  var p = path.resolve(me.path, me._entries[me._index])
  // set this to prevent trying to _read() again in the stat time.
  me._currentEntry = p
  console.error("  currentEntry=%s", p)
  fs[ me.props.follow ? "stat" : "lstat" ](p, function (er, stat) {
    if (er) return me.emit("error", er)

    console.error("  statted!", me._currentEntry === p)

    var entry = Reader({ path: p
                       , depth: me.depth + 1
                       , root: me.root || me
                       , parent: me
                       , follow: me.follow
                       , filter: me.filter
                       }, stat)

    me._currentEntry = entry

    console.error("  created child entry", !!entry, entry && entry.path, p)

    // "entry" events are for direct entries in a specific dir.
    // "child" events are for any and all children at all levels.
    // This nomenclature is not completely final.

    // entry.on("pause", function () {
    //   if (!me._paused) {
    //     console.error("child pause!")
    //     me.pause()
    //   }
    // })

    entry.on("resume", function () {
      if (me._paused) {
        console.error("    child resume!", p)
        me.resume()
      }
    })

    entry.on("ready", function () {
      console.error("    ready", p)
      me.emit("entry", entry)
      me.emit("child", entry)
    })

    var ended = false
    entry.on("end", onend)
    entry.on("close", onend)
    function onend () {
      if (ended) return
      ended = true
      console.error("    ending fuck fuck fuck", entry && entry.path, p)
      me.emit("childEnd", entry)
      me.emit("entryEnd", entry)
      me._currentEntry = null
      me._read()
    }

    // proxy up some events.

    entry.on("data", function (c) {
      me.emit("data", c)
    })

    entry.on("error", function (er) {
      me.emit("error", er)
    })

    entry.on("child", function (child) {
      me.emit("child", child)
    })

    entry.on("childEnd", function (child) {
      me.emit("childEnd", child)
    })

  })
}

DirReader.prototype.pause = function () {
  var me = this
  if (me._paused) return
  // console.error("  pause", me.path, new Error().stack)
  me._paused = true
  if (me._currentEntry && me._currentEntry.pause) {
    me._currentEntry.pause()
  }
  // me.emit("pause")
}

DirReader.prototype.resume = function () {
  var me = this
  // if (!me._paused) return
  // console.error("\n\nresume", me.path)
  me._paused = false
  if (me._currentEntry && me._currentEntry.resume) {
    // console.error("  resume currentEntry", me._currentEntry.path)
    me._currentEntry.resume()
  } else me._read()
  me.emit("resume")
}
