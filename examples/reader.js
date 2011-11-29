var fstream = require("../fstream.js")
var tap = require("tap")
var path = require("path")
var children = -1

var gotReady = false
var ended = false

tap.test("reader test", function (t) {

  var r = fstream.Reader({ path: path.dirname(__dirname)
                         , filter: function () {
                             // return this.parent === r
                             return this.parent === r || this === r
                           }
                         })

  r.on("ready", function () {
    gotReady = true
    children = r.props.nlink
    console.error("Setting expected children to "+children)
    t.equal(r.type, "Directory", "should be a directory")
  })

  r.on("entry", function (entry) {
    children --
    if (!gotReady) {
      t.fail("children before ready!")
    }
    t.equal(entry.dirname, r.path, "basename is parent dir")
  })

  r.on("error", function (er) {
    t.fail(er)
    t.end()
    process.exit(1)
  })

  r.on("end", function () {
    // 2 because "." and ".." aren't traversed
    t.equal(children, 2, "should have seen all children")
    ended = true
  })

  var closed = false
  r.on("close", function () {
    t.ok(ended, "saw end before close")
    t.notOk(closed, "close should only happen once")
    closed = true
    t.end()
  })

})
