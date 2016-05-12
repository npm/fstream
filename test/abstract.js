var format = require('util').format

var test = require('tap').test

var Abstract = require('../').Abstract

test('basic Abstract contract', function (t) {
  t.doesNotThrow(function () {
    t.ok(new Abstract())
  })
  var fstream = new Abstract()
  t.is(typeof fstream.on, 'function')

  // extra ways to end streams
  t.is(typeof fstream.abort, 'function')
  t.is(typeof fstream.destroy, 'function')

  // loggingish functions
  t.is(typeof fstream.warn, 'function')
  t.is(typeof fstream.info, 'function')
  t.is(typeof fstream.error, 'function')

  t.end()
})

test('calls "ready" callbacks even after event emitted', function (t) {
  var fstream = new Abstract()
  fstream.ready = true
  fstream.on('ready', function () {
    t.is(this._aborted, false, 'this is bound correctly')
    // called asap even though ready isn't emitted
    t.end()
  })
})

test('aborting abstractly', function (t) {
  var fstream = new Abstract()
  // gross, but no other way to observe this state for the base class
  t.is(fstream._aborted, false)
  fstream.on('abort', function () {
    // see above
    t.is(fstream._aborted, true)
    t.end()
  })

  fstream.abort()
})

test('destroying abstractly', function (t) {
  var fstream = new Abstract()
  t.doesNotThrow(function () { fstream.destroy() }, 'do nothing')
  t.end()
})

test('informing abstractly', function (t) {
  var fstream = new Abstract()
  t.doesNotThrow(function () { fstream.info('hi', 'EYO') })
  fstream.on('info', function (message, code) {
    t.is(message, 'yup')
    t.is(code, 'EHOWDY')
    t.end()
  })

  fstream.info('yup', 'EHOWDY')
})

test('warning abstractly', function (t) {
  t.test('emits with a listener', function (t) {
    var fstream = new Abstract()
    fstream.path = '/dev/null'
    fstream.on('warn', function (err) {
      t.is(err.message, 'hi')
      t.is(err.code, 'EFRIENDLY')
      t.is(err.fstream_class, 'Abstract')
      t.is(err.fstream_path, '/dev/null')
    })

    fstream.warn('hi', 'EFRIENDLY')
    t.end()
  })

  t.test('prints without a listener', function (t) {
    var fstream = new Abstract()
    fstream.path = '/dev/null'
    var _error = console.error
    console.error = function () {
      console.error = _error
      var formatted = format.apply(console, [].slice.call(arguments))
      t.matches(formatted, /^EUNFRIENDLY Error: ono/)
      t.matches(formatted, /fstream_class = Abstract/)
      t.matches(formatted, /path = \/dev\/null/)
      t.end()
    }

    fstream.warn('ono', 'EUNFRIENDLY')
  })

  t.test('prints without a listener and defaults to code of UNKNOWN', function (t) {
    var fstream = new Abstract()
    fstream.path = '/dev/null'
    var _error = console.error
    console.error = function () {
      console.error = _error
      var formatted = format.apply(console, [].slice.call(arguments))
      t.matches(formatted, /^UNKNOWN Error: wow mom/)
      t.matches(formatted, /fstream_class = Abstract/)
      t.matches(formatted, /path = \/dev\/null/)
      t.end()
    }

    fstream.warn('wow mom')
  })

  t.end()
})

test('erroring abstractly', function (t) {
  t.test('emits by default if handler set', function (t) {
    var fstream = new Abstract()
    t.throws(
      function () { fstream.error('whoops', 'EYIKES') },
      { message: 'whoops', code: 'EYIKES' },
      'streams throw if no handler is set'
    )

    fstream.linkpath = '/road/to/nowhere'
    fstream.on('error', function (err) {
      t.is(err.message, 'candygram!')
      t.is(err.code, 'ELANDSHARK')
      t.is(err.fstream_linkpath, '/road/to/nowhere')
      t.end()
    })

    fstream.error(new Error('candygram!'), 'ELANDSHARK')
  })

  t.test('throws when told to do so', function (t) {
    var fstream = new Abstract()

    fstream.linkpath = '/floor/13'

    t.throws(
      function () { fstream.error('candyman!', 'EBEES', true) },
      {
        message: 'candyman!',
        code: 'EBEES',
        fstream_linkpath: '/floor/13',
        fstream_class: 'Abstract'
      }
    )
    t.end()
  })

  t.end()
})
