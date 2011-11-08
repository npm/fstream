exports.Abstract = require("./lib/abstract.js")
exports.Reader = require("./lib/reader.js")
exports.Writer = require("./lib/writer.js")

exports.File =
  { Reader: require("./lib/file-reader.js")
  , Writer: require("./lib/file-writer.js") }

exports.Dir = 
  { Reader : require("./lib/dir-reader.js")
  , Writer : require("./lib/dir-writer.js") }

exports.Link =
  { Reader : require("./lib/link-reader.js")
  , Writer : require("./lib/link-writer.js") }

exports.Proxy =
  { Reader : require("./lib/proxy-reader.js")
  , Writer : require("./lib/proxy-writer.js") }

exports.Reader.Dir = exports.Dir.Reader
exports.Reader.File = exports.File.Reader
exports.Reader.Link = exports.Link.Reader
exports.Reader.Proxy = exports.Proxy.Reader

exports.Writer.Dir = exports.Dir.Writer
exports.Writer.File = exports.File.Writer
exports.Writer.Link = exports.Link.Writer
exports.Writer.Proxy = exports.Proxy.Writer
