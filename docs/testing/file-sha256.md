# File SHA-256 helper

`lib/utils/fileSha256.ts` provides bounded SHA-256 hashing for closed, private
restore artifacts. It is deliberately separate from the existing Metro
`node:crypto` shim, whose `createHash` implementation is deterministic FNV and is
not cryptographic SHA-256.

The helper accepts only local `file:///` URIs. It validates that the path exists,
is a file, and has an available non-negative integer size before opening it with
`FileMode.ReadOnly`. The default ceiling is 256 MiB. Callers can provide another
finite non-negative safe-integer ceiling. Reads are limited to 64 KiB, the
reported size and actual bytes are both checked against the ceiling, and short
reads, trailing bytes, or observed size changes fail closed. A zero-byte file is
valid input to this helper; the restore preparation caller remains responsible
for rejecting an empty database candidate.

The synchronous API supports pre-provider startup work. The asynchronous API
checks its abort signal before file access, between chunks, and before returning,
and yields to the event loop after at most 16 chunks. Both APIs close every opened
handle in a `finally` block.

The digest is computed incrementally with the exact `@noble/hashes` 2.4.0
`sha256.create().update(...).digest()` API. Production code does not import
`node:crypto`, load the whole file, use base64, or fall back to MD5.

Focused tests cover the known empty and `abc` vectors, a deterministic
multi-chunk vector checked against Node SHA-256 as a test-only oracle, explicit
read-only opening, bounded reads, limits, bad metadata and reads, size changes,
abort behavior, handle cleanup, and the absence of file access during module
import.

Run both release profiles:

```powershell
$env:EXPO_PUBLIC_RELEASE_PROFILE='full'
npm.cmd test -- --runInBand --selectProjects unit --runTestsByPath __tests__/utils/fileSha256.test.ts
$env:EXPO_PUBLIC_RELEASE_PROFILE='mvp'
npm.cmd test -- --runInBand --selectProjects unit --runTestsByPath __tests__/utils/fileSha256.test.ts
```

Size checks detect growth and truncation observed during hashing. They cannot
prove that a concurrently modified file with the same size retained identical
content. The restore flow therefore owns staging immutability and path
confinement. Android native performance and end-to-end replacement-restore proof
remain separate release gates.
