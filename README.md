Like FS streams, but with stats on them, and supporting every kind of
filesystem object.

So, for example, you can "write" a directory, and it'll call `mkdir`.  You
can specify a uid and gid, and it'll call `chown`.  You can specify a
`mtime` and `atime`, and it'll call `utimes`.

Note that it won't automatically resolve symbolic links.  So, if you
call `filestream.ReadStream('/some/symlink')` then you'll get an object
that stats and then ends immediately (since it has no data).

There are various checks to make sure that the bytes emitted are the
same as the intended size, if the size is set.

## Example

```javascript
fstream
  .Writer({ path: "path/to/file"
          , mode: 0755
          , size: 6
          , flags: 'w'
          })
  .write("hello\n")
  .end()
```

This will create the directories if they're missing, and then write
`hello\n` into the file, chmod it to 0755, and assert that 6 bytes have
been written when it's done.

```javascript
fstream
  .Writer({ path: "path/to/symlink"
          , linkpath: "./file"
          , isSymbolicLink: true
          , mode: '0755'
          })
  .end()
```

If isSymbolicLink is a function, it'll be called, and if it returns
true, then it'll treat it as a symlink.  If it's not a function, then
any truish value will make a symlink.

```javascript
// NOT YET IMPLEMENTED
fstream
  .Reader("path/to/dir")
  .pipe(fstream.Writer("path/to/other/dir"))
```

This will do like `cp -Rp path/to/dir path/to/other/dir`.  If the other
dir exists and isn't a directory, then it'll emit an error.  It'll also
set the uid, gid, mode, etc. to be identical.  In this way, it's more
like `rsync -a` than simply a copy.
