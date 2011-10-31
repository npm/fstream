var fstream = require("../fstream.js")
var path = require("path")

var r = fstream.Reader({ path: path.dirname(__dirname)
                       , filter: function () {
                           return !this.basename.match(/^\./)
                         }
                       })

r.on("entries", function (entries) {
  console.error("the entries", entries)
})

r.on("entry", function (entry) {
  console.error("a %s appears!", entry.type, entry.path)
})

r.on("end", function () {
  console.error("IT'S OVER!!")
})
