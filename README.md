Like FS streams, but with stat on them, and supporting directories and
symbolic links, as well as normal files.  Also, you can use this to set
the stats on a file, even if you don't change its contents, or to create
a symlink, etc.

So, for example, you can "write" a directory, and it'll call `mkdir`.  You
can specify a uid and gid, and it'll call `chown`.  You can specify a
`mtime` and `atime`, and it'll call `utimes`.  You can call it a symlink
and provide a `linkpath` and it'll call `symlink`.

Note that it won't automatically resolve symbolic links.  So, if you
call `fstream.Reader('/some/symlink')` then you'll get an object
that stats and then ends immediately (since it has no data).  To follow
symbolic links, do this: `fstream.Reader({path:'/some/symlink', follow:
true })`.

There are various checks to make sure that the bytes emitted are the
same as the intended size, if the size is set.

## Examples

```javascript
fstream
  .Writer({
    path: 'path/to/file',
    mode: parseInt('0755', 8),
    size: 6
  })
  .write('hello\n')
  .end()
```

This will create the directories if they're missing, and then write
`hello\n` into the file, chmod it to 0755, and assert that 6 bytes have
been written when it's done.

```javascript
fstream
  .Writer({
    path: 'path/to/file',
    mode: parseInt('0755', 8),
    size: 6,
    flags: 'a'
  })
  .write('hello\n')
  .end()
```

You can pass flags in, if you want to append to a file.

```javascript
fstream
  .Writer({
    path: 'path/to/symlink',
    linkpath: './file',
    SymbolicLink: true,
    mode: '0755' // octal strings supported
  })
  .end()
```

If isSymbolicLink is a function, it'll be called, and if it returns
true, then it'll treat it as a symlink.  If it's not a function, then
any truish value will make a symlink, or you can set `type:
'SymbolicLink'`, which does the same thing.

Note that the linkpath is relative to the symbolic link location, not
the parent dir or cwd.

```javascript
fstream
  .Reader("path/to/dir")
  .pipe(fstream.Writer("path/to/other/dir"))
```

This will do like `cp -Rp path/to/dir path/to/other/dir`.  If the other
dir exists and isn't a directory, then it'll emit an error.  It'll also
set the uid, gid, mode, etc. to be identical.  In this way, it's more
like `rsync -a` than simply a copy.

# API

## Abstract (extends `Stream`)

A base class that extends [`Stream`](https://nodejs.org/api/stream.html) with
useful utility methods. `fstream` streams are based on [streams1
semantics](https://gist.github.com/caike/ebccc95bd46f5fa1404d#file-streams-1-js).

### events

- `abort`: Stop further processing on the stream.
- `ready`: The stream is ready for reading; handlers passed to `.on()` will
  still be called if the stream is ready even if they're added after `ready` is
  emitted.
- `info`: Quasi-logging event emitted for diagnostic information.
- `warn`: Quasi-logging event emitted on non-fatal errors.
- `error`: Quasi-logging event emitted on fatal errors.

### properties

- `ready`: Whether the current file stream is ready to start processing. _Default: `false`_
- `path`: Path to the filesystem object this node is bound to.
- `linkpath`: Target path to which a link points.
- `type`: What type of filesystem entity this file stream node points to.

### abstract.abort()

Stop any further processing on the file stream by setting `this._aborted`; for
use by subclasses.

### abstract.destroy()

Abstract base method; overrides `Stream`'s `destroy` as a no-op.

### abstract.info(msg, code)

Quasi-logging method.

Emits an `info` event with `msg` and `code` attached.

### abstract.warn(msg, code)

Quasi-logging method.

Emits a `warn` event if it has any listeners; otherwise prints out an error
object decorated with `msg` and `code` to stderr.

### abstract.error(msg, code, throw)

If `throw` is true, throw an Error decorated with the message or code.
Otherwise, emit `error` with the decorated Error. `msg` can also be an Error
object itself; it will be wrapped in a new Error before being annotated.
