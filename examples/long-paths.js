// This test creates a file with a path that's over 300 characters
// long, which is longer than the Windows limit unless you use the
// '\\?\' prefix.
// https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247%28v=vs.85%29.aspx
//
// Then it passes that directory into and out of fstream, to see if
// that file comes out the other side. This tests
// https://github.com/npm/fstream/issues/30

var tap = require('tap')
var temp = require('temp').track()
var fs = require('fs')
var path = require('path')
var mkdirp = require('mkdirp')
var fstream = require('../fstream.js')

tap.test('long file paths', function (t) {
  var inputDir = temp.mkdirSync('fstream-test-input')
  var outputDir = temp.mkdirSync('fstream-test-output')

  var longDir = inputDir
  while (longDir.length < 300) {
    longDir = path.join(longDir, 'subdirectory')
  }

  var STAMP = 'stamp'

  mkdirp.sync(longDir)
  var inputStampedFile = path.join(longDir, 'file')
  fs.writeFileSync(inputStampedFile, STAMP)

  var onPipeComplete = function () {
    var outputStampedFile = inputStampedFile.replace(inputDir, outputDir)
    t.equal(fs.readFileSync(outputStampedFile, 'utf-8'), STAMP)
    t.end()
  }

  var reader = fstream.Reader(inputDir)
  reader.on('end', onPipeComplete)
  reader.pipe(fstream.Writer(outputDir))
})
