module.exports = proxyEvents

function proxyEvents (evs, from, to) {
  evs.forEach(function (ev) {
    from.on(ev, function () {
      var l = arguments.length
        , args = new Array(l + 1)
      args[0] = ev
      for (var i = 0, l = arguments.length; i < l; i ++) {
        args[i + 1] = arguments[i]
      }
      to.emit.apply(to, args)
    })
  })
}
