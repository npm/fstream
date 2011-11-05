module.exports = collect

function collect (stream) {
  if (stream._collected) return

  stream._collected = true
  stream.pause()

  stream.on("data", save)
  stream.on("end", save)
  var buf = []
  function save (b) {
    if (typeof b === "string") b = new Buffer(b)
    if (Buffer.isBuffer(b) && !b.length) return
    buf.push(b)
  }

  stream.on("entry", saveEntry)
  var entryBuffer = []
  function saveEntry (e) {
    collect(e)
    entryBuffer.push(e)
  }

  stream.on("proxy", proxyPause)
  function proxyPause (p) {
    p.pause()
  }


  // replace the pipe method with a new version that will
  // unlock the buffered stuff.
  stream.pipe = (function (orig) { return function (dest) {
    if (!dest) {
      stream.pipe = orig
      stream.removeListener("entry", saveEntry)
      stream.removeListener("data", save)
      stream.removeListener("end", save)
      stream.resume()
      return
    }

    // let the entries flow through one at a time.
    // Once they're all done, then we can resume completely.
    var e = 0
    ;(function unblockEntry () {
      var entry = entryBuffer[e++]
      if (!entry) return resume()
      entry.on("end", unblockEntry)
      dest.addEntry(entry)
    })()

    function resume () {
      buf.forEach(function (b) {
        if (b) dest.write(b)
        else dest.end()
      })

      stream.removeListener("entry", saveEntry)
      stream.removeListener("data", save)
      stream.removeListener("end", save)

      stream.pipe = orig
      stream.pipe(dest)
      stream.resume()
    }

    return dest
  }})(stream.pipe)
}
