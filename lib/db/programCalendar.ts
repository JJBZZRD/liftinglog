import { and, eq, gte, lte, asc, desc, sql, inArray } from "drizzle-orm";
import { db } from "./connection";
import {
  programCalendar,
  programCalendarExercises,
  programCalendarSets,
  pslPrograms,
} from "./schema";
import type {
  ProgramCalendarRow,
  ProgramCalendarExerciseRow,
  ProgramCalendarSetRow,
} from "./schema";
import type { CalendarEntry } from "../programs/psl/pslService";

export type { ProgramCalendarRow, ProgramCalendarExerciseRow, ProgramCalendarSetRow };

// ── Calendar Entries ────────────────────────────────────────

export async function insertCalendarEntries(
  programId: number,
  entries: CalendarEntry[]
): Promise<void> {
  for (const entry of entries) {
    const calRows = await db
      .insert(programCalendar)
      .values({
        programId,
        pslSessionId: entry.pslSessionId,
        sessionName: entry.sessionName,
        dateIso: entry.dateIso,
        sequence: entry.sequence,
        status: "pending",
      })
      .returning();

    const calId = calRows[0].id;

    for (const ex of entry.exercises) {
      const exRows = await db
        .insert(programCalendarExercises)
        .values({
          calendarId: calId,
          exerciseName: ex.exerciseName,
          exerciseId: null,
          orderIndex: ex.orderIndex,
          prescribedSetsJson: JSON.stringify(ex.sets),
          status: "pending",
        })
        .returning();

      const exId = exRows[0].id;

      if (ex.sets.length > 0) {
        await db.insert(programCalendarSets).values(
          ex.sets.map((s) => ({
            calendarExerciseId: exId,
            setIndex: s.setIndex,
            prescribedReps: s.prescribedReps,
            prescribedIntensityJson: s.prescribedIntensityJson,
            prescribedRole: s.prescribedRole,
            isUserAdded: false,
            isLogged: false,
          }))
        );
      }
    }
  }
}

export async function deleteCalendarForProgram(programId: number): Promise<void> {
  await db.delete(programCalendar).where(eq(programCalendar.programId, programId));
}

// ── Queries ─────────────────────────────────────────────────

export async function getCalendarEntriesForDateRange(
  startIso: string,
  endIso: string
): Promise<(ProgramCalendarRow & { programName: string })[]> {
  const rows = await db
    .select({
      id: programCalendar.id,
      programId: programCalendar.programId,
      pslSessionId: programCalendar.pslSessionId,
      sessionName: programCalendar.sessionName,
      dateIso: programCalendar.dateIso,
      sequence: programCalendar.sequence,
      status: programCalendar.status,
      completedAt: programCalendar.completedAt,
      programName: pslPrograms.name,
    })
    .from(programCalendar)
    .innerJoin(pslPrograms, eq(programCalendar.programId, pslPrograms.id))
    .where(
      and(
        eq(pslPrograms.isActive, true),
        gte(programCalendar.dateIso, startIso),
        lte(programCalendar.dateIso, endIso)
      )
    )
    .orderBy(asc(programCalendar.dateIso), asc(programCalendar.sequence));

  return rows;
}

export async function getCalendarSessionsForDate(
  dateIso: string
): Promise<(ProgramCalendarRow & { programName: string })[]> {
  return getCalendarEntriesForDateRange(dateIso, dateIso);
}

export interface CalendarExerciseWithSets extends ProgramCalendarExerciseRow {
  sets: ProgramCalendarSetRow[];
}

export async function getExercisesForCalendarEntry(
  calendarId: number
): Promise<CalendarExerciseWithSets[]> {
  const exercises = await db
    .select()
    .from(programCalendarExercises)
    .where(eq(programCalendarExercises.calendarId, calendarId))
    .orderBy(asc(programCalendarExercises.orderIndex));

  const result: CalendarExerciseWithSets[] = [];
  for (const ex of exercises) {
    const sets = await db
      .select()
      .from(programCalendarSets)
      .where(eq(programCalendarSets.calendarExerciseId, ex.id))
      .orderBy(asc(programCalendarSets.setIndex));
    result.push({ ...ex, sets });
  }
  return result;
}

export async function getAllExercisesForDate(
  dateIso: string
): Promise<{ session: ProgramCalendarRow & { programName: string }; exercises: CalendarExerciseWithSets[] }[]> {
  const sessions = await getCalendarSessionsForDate(dateIso);
  const result: { session: ProgramCalendarRow & { programName: string }; exercises: CalendarExerciseWithSets[] }[] = [];

  for (const session of sessions) {
    const exercises = await getExercisesForCalendarEntry(session.id);
    result.push({ session, exercises });
  }
  return result;
}

// ── Date Navigation ─────────────────────────────────────────

export async function getNextProgrammedDate(
  fromIso: string,
  direction: "forward" | "backward"
): Promise<string | null> {
  const op = direction === "forward" ? sql`>` : sql`<`;
  const order = direction === "forward" ? asc : desc;

  const rows = await db
    .select({ dateIso: programCalendar.dateIso })
    .from(programCalendar)
    .innerJoin(pslPrograms, eq(programCalendar.programId, pslPrograms.id))
    .where(
      and(
        eq(pslPrograms.isActive, true),
        sql`${programCalendar.dateIso} ${op} ${fromIso}`
      )
    )
    .orderBy(order(programCalendar.dateIso))
    .limit(1);

  return rows[0]?.dateIso ?? null;
}

export async function getProgrammedDatesInRange(
  startIso: string,
  endIso: string
): Promise<Map<string, { statuses: string[]; programNames: string[] }>> {
  const rows = await db
    .select({
      dateIso: programCalendar.dateIso,
      status: programCalendar.status,
      programName: pslPrograms.name,
    })
    .from(programCalendar)
    .innerJoin(pslPrograms, eq(programCalendar.programId, pslPrograms.id))
    .where(
      and(
        eq(pslPrograms.isActive, true),
        gte(programCalendar.dateIso, startIso),
        lte(programCalendar.dateIso, endIso)
      )
    )
    .orderBy(asc(programCalendar.dateIso));

  const map = new Map<string, { statuses: string[]; programNames: string[] }>();
  for (const row of rows) {
    const existing = map.get(row.dateIso);
    if (existing) {
      existing.statuses.push(row.status);
      if (!existing.programNames.includes(row.programName)) {
        existing.programNames.push(row.programName);
      }
    } else {
      map.set(row.dateIso, {
        statuses: [row.status],
        programNames: [row.programName],
      });
    }
  }
  return map;
}

// ── Set Logging ─────────────────────────────────────────────

export async function updateSetActuals(
  setId: number,
  data: {
    actualWeight?: number | null;
    actualReps?: number | null;
    actualRpe?: number | null;
    isLogged?: boolean;
    setId_fk?: number | null;
  }
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.actualWeight !== undefined) updateData.actualWeight = data.actualWeight;
  if (data.actualReps !== undefined) updateData.actualReps = data.actualReps;
  if (data.actualRpe !== undefined) updateData.actualRpe = data.actualRpe;
  if (data.isLogged !== undefined) {
    updateData.isLogged = data.isLogged;
    if (data.isLogged) updateData.loggedAt = Date.now();
  }
  if (data.setId_fk !== undefined) updateData.setId = data.setId_fk;

  await db
    .update(programCalendarSets)
    .set(updateData)
    .where(eq(programCalendarSets.id, setId));
}

export async function addUserSet(
  calendarExerciseId: number,
  setIndex: number
): Promise<ProgramCalendarSetRow> {
  const rows = await db
    .insert(programCalendarSets)
    .values({
      calendarExerciseId,
      setIndex,
      isUserAdded: true,
      isLogged: false,
    })
    .returning();
  return rows[0];
}

export async function deleteUserSet(setId: number): Promise<void> {
  await db
    .delete(programCalendarSets)
    .where(
      and(
        eq(programCalendarSets.id, setId),
        eq(programCalendarSets.isUserAdded, true)
      )
    );
}

// ── Completion Status ───────────────────────────────────────

export async function updateExerciseStatus(
  exerciseId: number,
  status: "pending" | "partial" | "complete"
): Promise<void> {
  await db
    .update(programCalendarExercises)
    .set({ status })
    .where(eq(programCalendarExercises.id, exerciseId));
}

export async function updateSessionStatus(
  calendarId: number,
  status: "pending" | "partial" | "complete" | "missed"
): Promise<void> {
  const updateData: Record<string, unknown> = { status };
  if (status === "complete") updateData.completedAt = Date.now();
  await db
    .update(programCalendar)
    .set(updateData)
    .where(eq(programCalendar.id, calendarId));
}

export async function computeExerciseStatus(
  calendarExerciseId: number
): Promise<"pending" | "partial" | "complete"> {
  const sets = await db
    .select()
    .from(programCalendarSets)
    .where(eq(programCalendarSets.calendarExerciseId, calendarExerciseId));

  const prescribed = sets.filter((s) => !s.isUserAdded);
  if (prescribed.length === 0) return "pending";

  const logged = prescribed.filter((s) => s.isLogged);
  if (logged.length === 0) return "pending";
  if (logged.length >= prescribed.length) return "complete";
  return "partial";
}

export async function computeSessionStatus(
  calendarId: number
): Promise<"pending" | "partial" | "complete"> {
  const exercises = await db
    .select()
    .from(programCalendarExercises)
    .where(eq(programCalendarExercises.calendarId, calendarId));

  if (exercises.length === 0) return "pending";

  const statuses = exercises.map((e) => e.status);
  if (statuses.every((s) => s === "complete")) return "complete";
  if (statuses.some((s) => s === "complete" || s === "partial")) return "partial";
  return "pending";
}

export async function markSessionComplete(calendarId: number): Promise<void> {
  const exercises = await db
    .select()
    .from(programCalendarExercises)
    .where(eq(programCalendarExercises.calendarId, calendarId));

  for (const ex of exercises) {
    if (ex.status !== "complete") {
      const status = await computeExerciseStatus(ex.id);
      await updateExerciseStatus(ex.id, status === "pending" ? "pending" : status);
    }
  }

  await updateSessionStatus(calendarId, "complete");
}

export async function getCalendarEntryById(
  id: number
): Promise<ProgramCalendarRow | undefined> {
  const rows = await db
    .select()
    .from(programCalendar)
    .where(eq(programCalendar.id, id));
  return rows[0];
}

export async function getCalendarExerciseById(
  id: number
): Promise<ProgramCalendarExerciseRow | undefined> {
  const rows = await db
    .select()
    .from(programCalendarExercises)
    .where(eq(programCalendarExercises.id, id));
  return rows[0];
}

export async function getSetsForCalendarExercise(
  calendarExerciseId: number
): Promise<ProgramCalendarSetRow[]> {
  return db
    .select()
    .from(programCalendarSets)
    .where(eq(programCalendarSets.calendarExerciseId, calendarExerciseId))
    .orderBy(asc(programCalendarSets.setIndex));
}

export async function linkExerciseToDb(
  calendarExerciseId: number,
  exerciseId: number
): Promise<void> {
  await db
    .update(programCalendarExercises)
    .set({ exerciseId })
    .where(eq(programCalendarExercises.id, calendarExerciseId));
}

export async function markMissedSessions(beforeDateIso: string): Promise<void> {
  await db
    .update(programCalendar)
    .set({ status: "missed" })
    .where(
      and(
        eq(programCalendar.status, "pending"),
        sql`${programCalendar.dateIso} < ${beforeDateIso}`
      )
    );
}
