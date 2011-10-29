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
