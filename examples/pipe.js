var fstream = require("../fstream.js")
var path = require("path")
debugger
var r = fstream.Reader({ path: path.dirname(__dirname)
                       , filter: function () {
                           return !this.basename.match(/^\./) &&
                                  !this.basename.match(/^node_modules$/)
                                  !this.basename.match(/^deep-copy$/)
                         }
                       })

var w = fstream.Writer({ path: path.resolve(__dirname, "deep-copy")
                       , type: "Directory"
                       })

r.on("entry", function (entry) {
  console.error("a %s appears!", entry.type, entry.path)
})

w.on("entry", function (entry) {
  console.error("%s attacks!", entry.type, entry.path)
})

r.on("end", function () {
  console.error("IT'S OVER!!")
})

r.pipe(w)
