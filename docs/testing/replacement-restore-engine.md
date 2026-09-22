# Replacement restore engine implementation notes

MVP-006B5 implements the seven connection-free replacement restore methods in
`lib/db/replacementRestore.ts`. Importing the module is inert. Preparation owns
only a private work copy and a separately sealed backup snapshot; the live
database handle is supplied only to the synchronous startup apply method.

Preparation accepts supported source manifests, including the pinned historical
layout and extensionless SQLite files. It checks the size and SQLite header
before opening, begins validation-only connections with `query_only=ON` followed
by `trusted_schema=OFF`, migrates the private work copy, and revalidates the
closed sealed file. If closure of an owned file or SQLite handle cannot be
confirmed, the private staging directory is retained so an open handle is never
deleted underneath the provider.

Scheduling publishes a strict versioned pending record through the native
control facade. Physical rereads decide publication, cancellation, and cleanup;
an acknowledgement failure never authorizes deletion of a possibly published
candidate. Native process tokens enforce the A-schedules, A-reloads-blocked,
B-attempts, B-reloads-blocked, C-retries lifecycle.

Startup replacement validates the current live schema without bootstrapping,
attaches the sealed candidate by a bound filename, and uses one synchronous
`BEGIN IMMEDIATE` transaction. It deletes and inserts all fifteen app tables in
compiled order with explicit columns, clears copied media URIs, rebuilds PB
events through the canonical pure derivation, and verifies counts, foreign keys,
soft links, UIDs, and media state before commit. A thrown COMMIT acknowledgement
is always treated as unknown. A safe discard token exists only for a proven
unchanged baseline and a verified rollback or pre-transaction failure.

After commit, the outcome is durably verified before pending retirement.
Outcome and pending cleanup retries use only same-process committed context and
never rerun SQL. Candidate staging is retained when detach is unconfirmed. The
precommit URI strings remain in process-local committed context for the later
media-completion owner and are never serialized. This seam is explicitly
untrusted: arbitrary file URIs, gallery/content URIs, and malformed strings have
not been classified as app-managed paths. The later owner must apply strict
owned-path validation against fresh current rows immediately before any deletion.

The v1 outcome parser intentionally accepts only `postCommitStatus: "pending"`.
The later media-completion ticket must add strict parsing for its validated
complete result before it retires the outcome; it must not interpret an unknown
or malformed complete record as absence or as a startup replay instruction.

Host tests use the production transaction and Node's SQLite adapter. They cover
real replacement and rollback, PB rebuild failure, BEGIN/COMMIT ambiguity,
control publication and cleanup races, process-token transitions, candidate
change/missing/corruption, source immutability, historical migration, sealed
health checks, and unconfirmed handle closure. Android process-death and native
file-handle testing remains the later integration gate described by the ticket.
