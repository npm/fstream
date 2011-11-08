module.exports = FileWriter

var fs = require("graceful-fs")
  , mkdir = require("mkdirp")
  , Writer = require("./writer.js")
  , inherits = require("inherits")

inherits(FileWriter, Writer)

function FileWriter (props) {
  var me = this
  if (!(me instanceof FileWriter)) throw new Error(
    "FileWriter must be called as constructor.")

  // should already be established as a File type
  if (props.type !== "File" || !props.File) {
    throw new Error("Non-file type "+ props.type)
  }

  me._bytesWritten = 0

  Writer.call(this, props)
}

FileWriter.prototype._create = function () {
  var me = this

  var so = {}
  if (me.props.flags) so.flags = me.props.flags
  so.mode = Writer.filemode
  if (me._old && me._old.blksize) so.bufferSize = me._old.blksize

  me._stream = fs.createWriteStream(me.path, so)

  me._stream.on("open", function (fd) {
    me._ready = true
    me.emit("ready")
  })

  me._stream.on("drain", function () { me.emit("drain") })

  me._stream.on("close", function () {
    // console.error("\n\nFW Stream Close", me.path, me.size)
    me._finish()
  })
}

FileWriter.prototype.write = function (c) {
  var me = this
    , ret = me._stream.write(c)

  me._bytesWritten += c.length
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
    me.error(
      "Did not get expected byte count.\n" +
      "path: " + me.path + "\n" +
      "expect: " + me.size + "\n" +
      "actual: " + me._bytesWritten)
  }
  Writer.prototype._finish.call(me)
}
