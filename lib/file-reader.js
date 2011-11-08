// Basically just a wrapper around an fs.ReadStream

module.exports = FileReader

var fs = require("graceful-fs")
  , fstream = require("../fstream.js")
  , Reader = fstream.Reader
  , inherits = require("inherits")
  , mkdir = require("mkdirp")
  , Reader = require("./reader.js")

inherits(FileReader, Reader)

function FileReader (props) {
  // console.error("    FR create", props.path, props.size, new Error().stack)
  var me = this
  if (!(me instanceof FileReader)) throw new Error(
    "FileReader must be called as constructor.")

  // should already be established as a File type
  // XXX Todo: preserve hardlinks by tracking dev+inode+nlink,
  // with a HardLinkReader class.
  if (!((props.type === "Link" && props.Link) ||
        (props.type === "File" && props.File))) {
    throw new Error("Non-file type "+ props.type)
  }

  me._buffer = []
  me._bytesEmitted = 0
  Reader.call(me, props)
}

FileReader.prototype._getStream = function () {
  var me = this
    , stream = me._stream = fs.createReadStream(me.path, me.props)

  if (me.props.blksize) {
    stream.bufferSize = me.props.blksize
  }

  stream.on("open", me.emit.bind(me, "open"))

  stream.on("data", function (c) {
    // console.error("\t\t%d %s", c.length, me.basename)
    me._bytesEmitted += c.length
    // no point saving empty chunks
    if (!c.length) return
    else if (me._paused || me._buffer.length) me._buffer.push(c)
    else me.emit("data", c)
  })

  stream.on("end", function () {
    if (me._paused || me._buffer.length) {
      me._buffer.push(null)
      me._read()
    } else {
      me.emit("end")
      me.emit("_end")
    }

    if (me._bytesEmitted !== me.props.size) {
      me.error("Didn't get expected byte count\n"+
               "type: " + me.type + "\n"+
               "path: " + me.path + "\n" +
               "expect: "+me.props.size + "\n" +
               "actual: "+me._bytesEmitted)
    }
  })

  stream.on("close", me.emit.bind(me, "close"))

  me._read()
}

FileReader.prototype._read = function () {
  var me = this
  if (me._paused) return
  if (!me._stream) return me._getStream()

  // clear out the buffer, if there is one.
  if (me._buffer.length) {
    var buf = me._buffer
    me._buffer.length = 0
    for (var i = 0, l = buf.length; i < l; i ++) {
      var c = buf[i]
      if (c === null) {
        me.emit("end")
        me.emit("_end")
      } else {
        me.emit("data", c)
        if (me._paused) {
          me._buffer = buf.slice(i)
          return
        }
      }
    }
  }
  // that's about all there is to it.
}

FileReader.prototype.pause = function () {
  var me = this
  me._paused = true
  if (me._stream) me._stream.pause()
}

FileReader.prototype.resume = function () {
  var me = this
  // empty the buffer, if there is one.
  // then resume the underlying impl stream.
  me._paused = false
  me._read()
  if (me._stream) me._stream.resume()
}
