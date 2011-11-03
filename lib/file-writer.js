module.exports = FileWriter

var fs = require("graceful-fs")
  , mkdir = require("mkdirp")
  , fstream = require("../fstream.js")
  , Writer = fstream.Writer
  , inherits = require("inherits")

inherits(FileWriter, Writer)

function FileWriter (props) {
  var me = this
  if (!(me instanceof FileWriter)) throw new Error(
    "FileWriter must be called as constructor.")

  // should already be established as a Directory type
  if (props.type !== "File" || !props.Directory) {
    throw new Error("Non-file type "+ props.type)
  }

  me._bytesWritten = 0

  Writer.call(this, props)
}

FileWriter.prototype._create = function () {
  var me = this

  // should always chmod explicitly.
  me.props.mode = me.props.mode || Writer.filemode

  me._stream = fs.createWriteStream(me.path, me.props)

  me._stream.on("open", function (fd) {
    me._ready = true
    me.emit("ready")
  })

  me._stream.on("drain", function () { me.emit("drain") })

  me._stream.on("close", function () {
    me._finish()
  })
}

FileWriter.prototype.write = function (c) {
  me._bytesWritten += c.length

  var me = this
    , ret = me._stream.write(c)
  // allow 2 buffered writes, because otherwise there's just too
  // much stop and go bs.
  return ret || (me._stream._queue && me._stream._queue.length <= 2)
}

FileWriter.prototype.end = function (c) {
  var me = this
  me._stream.end()
}

FileWriter.prototype._finish = function () {
  var me = this
  if (typeof me.size === "number" && me._bytesWritten != me.size) {
    me.emit("error", new Error(
      "Did not get expected number of bytes.\n" +
      "expect: " + me.size + "\n" +
      "actual: " + me._bytesWritten))
  }
  Writer.prototype._finish.call(me)
}
