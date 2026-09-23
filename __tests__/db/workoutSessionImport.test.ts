import { createManualLoggingDatabase, initializeTestDatabaseBindings } from "../helpers/manualLoggingDatabase";

const mockDatabase = createManualLoggingDatabase();
let mockBackup = createManualLoggingDatabase();
jest.mock("expo-sqlite", () => ({ openDatabaseSync: () => ({ ...mockBackup.expoDatabase, closeSync() {} }) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file:///backup.db", name: "backup.db" }] }) }));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("expo-file-system", () => {
  class Directory { uri = "file:///temp"; exists = true; create() {} delete() {} }
  class File extends Directory {}
  return { Directory, File, Paths: { document: { uri: "file:///document" } } };
});
jest.mock("expo-file-system/legacy", () => ({ EncodingType: { Base64: "base64", UTF8: "utf8" }, readAsStringAsync: async () => "SQLite format 3", writeAsStringAsync: async () => {} }));
jest.mock("../../lib/db/backupSnapshot", () => ({ createSealedBackupSnapshot: jest.fn() }));
jest.mock("../../lib/utils/videoStorage", () => ({}));
initializeTestDatabaseBindings(mockDatabase);
const { initializeDatabase } = require("../../lib/db/bootstrap") as typeof import("../../lib/db/bootstrap");
const { importDatabaseBackup } = require("../../lib/db/backup") as typeof import("../../lib/db/backup");
const sessions = require("../../lib/db/workoutSessions") as typeof import("../../lib/db/workoutSessions");

describe("workout session backup merge", () => {
  beforeEach(() => {
    mockDatabase.expoDatabase.execSync("DELETE FROM workouts; DELETE FROM exercises;");
    mockBackup.close();
    mockBackup = createManualLoggingDatabase();
    initializeDatabase(mockBackup.expoDatabase as never);
    mockBackup.expoDatabase.execSync("DROP INDEX idx_workouts_single_active;");
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { mockBackup.close(); mockDatabase.close(); });

  it("preserves live active state and notes while importing separate named sessions and open exercise history", async () => {
    const active = await sessions.createWorkoutSession(1000);
    await sessions.updateWorkoutSession(active, { name: "Live name", note: "Live note" });
    mockDatabase.expoDatabase.execSync(`UPDATE workouts SET uid = 'live' WHERE id = ${active};
      INSERT INTO exercises(id, uid, name) VALUES (1, 'shared-exercise', 'Bench');
      INSERT INTO workout_exercises(id, uid, workout_id, exercise_id, performed_at) VALUES (1, 'live-entry', ${active}, 1, 1000);`);
    mockBackup.expoDatabase.execSync(`
      INSERT INTO workouts(id, uid, started_at, completed_at, name, note) VALUES
        (1, 'live', 1000, 2000, 'Stale name', 'Stale note'),
        (2, 'backup-a', 1000, NULL, 'Same time separate session', 'Backup A'),
        (3, 'backup-b', 3000, NULL, 'Latest backup', 'Backup B');
      INSERT INTO exercises(id, uid, name) VALUES (1, 'shared-exercise', 'Bench');
      INSERT INTO workout_exercises(id, uid, workout_id, exercise_id, completed_at, performed_at, note) VALUES
        (1, 'live-entry', 1, 1, 2000, 1000, NULL), (2, 'backup-entry', 2, 1, NULL, 1100, 'Entry note');
      INSERT INTO sets(id, uid, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at, note) VALUES
        (1, 'backup-set', 2, 1, 2, 100, 5, 1150, 'Set note');
      INSERT INTO media(id, local_uri, mime, set_id, workout_id, note) VALUES (1, 'photo', 'image/jpeg', 1, 2, 'Media note');
    `);
    await importDatabaseBackup();
    await importDatabaseBackup();
    expect(mockDatabase.rows("SELECT uid FROM workouts WHERE completed_at IS NULL")).toEqual([{ uid: "live" }]);
    expect(mockDatabase.rows("SELECT name, note FROM workouts WHERE uid = 'live'")).toEqual([{ name: "Live name", note: "Live note" }]);
    expect(mockDatabase.rows("SELECT uid, name FROM workouts ORDER BY uid")).toEqual([
      { uid: "backup-a", name: "Same time separate session" }, { uid: "backup-b", name: "Latest backup" }, { uid: "live", name: "Live name" },
    ]);
    expect(mockDatabase.rows("SELECT uid, completed_at FROM workout_exercises ORDER BY uid")).toEqual([{ uid: "backup-entry", completed_at: null }, { uid: "live-entry", completed_at: null }]);
    expect(mockDatabase.rows("SELECT count(*) AS count FROM sets")).toEqual([{ count: 1 }]);
    expect(mockDatabase.rows("SELECT count(*) AS count FROM media")).toEqual([{ count: 1 }]);
    expect(mockDatabase.rows("SELECT count(*) AS count FROM pr_events")[0].count).toBeGreaterThan(0);
    expect(mockDatabase.rows("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("chooses only the newest imported active when no live active exists and handles missing name columns", async () => {
    mockBackup.expoDatabase.execSync(`ALTER TABLE workouts DROP COLUMN name;
      INSERT INTO workouts(id, uid, started_at, note) VALUES (1, 'old', 1000, 'untouched old note'), (2, 'new', 2000, 'untouched new note');`);
    await importDatabaseBackup();
    expect(mockDatabase.rows("SELECT uid, completed_at, name, note FROM workouts ORDER BY started_at")).toEqual([
      { uid: "old", completed_at: 1000, name: null, note: "untouched old note" },
      { uid: "new", completed_at: null, name: null, note: "untouched new note" },
    ]);
  });

  it("keeps newly imported sets and media with an entry that was moved since the backup", async () => {
    mockDatabase.expoDatabase.execSync(`
      INSERT INTO workouts(id, uid, started_at, completed_at) VALUES (1, 'source', 1000, 2000), (2, 'target', 3000, NULL);
      INSERT INTO exercises(id, uid, name) VALUES (1, 'lift', 'Bench');
      INSERT INTO workout_exercises(id, uid, workout_id, exercise_id, performed_at, completed_at) VALUES (1, 'moved-entry', 2, 1, 3000, 4000);`);
    mockBackup.expoDatabase.execSync(`
      INSERT INTO workouts(id, uid, started_at, completed_at) VALUES (1, 'source', 1000, 2000);
      INSERT INTO exercises(id, uid, name) VALUES (1, 'lift', 'Bench');
      INSERT INTO workout_exercises(id, uid, workout_id, exercise_id, performed_at, completed_at) VALUES (1, 'moved-entry', 1, 1, 1000, 2000);
      INSERT INTO sets(id, uid, workout_id, exercise_id, workout_exercise_id, weight_kg, reps, performed_at) VALUES (1, 'new-set', 1, 1, 1, 100, 5, 1100);
      INSERT INTO media(local_uri, mime, set_id, workout_id) VALUES ('photo', 'image/jpeg', 1, 1);`);
    await importDatabaseBackup();
    expect(mockDatabase.rows("SELECT workout_id, workout_exercise_id FROM sets")).toEqual([{ workout_id: 2, workout_exercise_id: 1 }]);
    expect(mockDatabase.rows("SELECT workout_id FROM media")).toEqual([{ workout_id: 2 }]);
    expect(mockDatabase.rows("SELECT completed_at, performed_at FROM workout_exercises")).toEqual([{ completed_at: 4000, performed_at: 3000 }]);
    expect(mockDatabase.rows("PRAGMA foreign_key_check")).toEqual([]);
  });
});
