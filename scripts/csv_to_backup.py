#!/usr/bin/env python3
"""
Convert a WorkoutLog CSV export into a SQLite backup file compatible with the app's import functionality.

Usage:
    python csv_to_backup.py input.csv output.db

The CSV is expected to have the format:
    -----Strength-----
    Date,Time,Exercise,# of Reps,Weight,Notes
    "19/01/2026","18:34","Bicep Curl","6","50","Right"
    ...
"""

import csv
import sqlite3
import sys
import uuid
from datetime import datetime
from pathlib import Path
from collections import defaultdict


def generate_uid() -> str:
    """Generate a unique identifier matching the app's format."""
    return str(uuid.uuid4())


def parse_datetime(date_str: str, time_str: str) -> int:
    """Parse DD/MM/YYYY and HH:MM into Unix timestamp (milliseconds)."""
    try:
        dt = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%Y %H:%M")
        return int(dt.timestamp() * 1000)
    except ValueError:
        # Try alternative format
        try:
            dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
            return int(dt.timestamp() * 1000)
        except ValueError:
            return int(datetime.now().timestamp() * 1000)


def create_schema(conn: sqlite3.Connection):
    """Create the database schema matching the WorkoutLog app."""
    conn.executescript("""
        -- Core tables
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY NOT NULL,
            e1rm_formula TEXT NOT NULL,
            unit_preference TEXT NOT NULL,
            theme_preference TEXT NOT NULL DEFAULT 'system'
        );

        CREATE TABLE IF NOT EXISTS exercises (
            id INTEGER PRIMARY KEY NOT NULL,
            uid TEXT,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            muscle_group TEXT,
            equipment TEXT,
            is_bodyweight INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER,
            last_rest_seconds INTEGER,
            is_pinned INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS workouts (
            id INTEGER PRIMARY KEY NOT NULL,
            uid TEXT,
            started_at INTEGER NOT NULL,
            completed_at INTEGER,
            note TEXT
        );

        CREATE TABLE IF NOT EXISTS workout_exercises (
            id INTEGER PRIMARY KEY NOT NULL,
            uid TEXT,
            workout_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            order_index INTEGER,
            note TEXT,
            current_weight REAL,
            current_reps INTEGER,
            completed_at INTEGER,
            performed_at INTEGER,
            FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
            FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS sets (
            id INTEGER PRIMARY KEY NOT NULL,
            uid TEXT,
            workout_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            workout_exercise_id INTEGER,
            set_group_id TEXT,
            set_index INTEGER,
            weight_kg REAL,
            reps INTEGER,
            rpe REAL,
            rir REAL,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            note TEXT,
            superset_group_id TEXT,
            performed_at INTEGER,
            FOREIGN KEY(workout_id) REFERENCES workouts(id) ON DELETE CASCADE,
            FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT,
            FOREIGN KEY(workout_exercise_id) REFERENCES workout_exercises(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS pr_events (
            id INTEGER PRIMARY KEY NOT NULL,
            uid TEXT,
            set_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            metric_value REAL NOT NULL,
            occurred_at INTEGER NOT NULL,
            FOREIGN KEY(set_id) REFERENCES sets(id) ON DELETE CASCADE,
            FOREIGN KEY(exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_sets_workout_id ON sets(workout_id);
        CREATE INDEX IF NOT EXISTS idx_sets_exercise_id ON sets(exercise_id);
        CREATE INDEX IF NOT EXISTS idx_sets_performed_at ON sets(performed_at);
        CREATE INDEX IF NOT EXISTS idx_workout_exercises_order ON workout_exercises(workout_id, order_index);
        
        -- UID indexes
        CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_uid ON exercises(uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_workouts_uid ON workouts(uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_exercises_uid ON workout_exercises(uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_uid ON sets(uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_events_uid ON pr_events(uid);
    """)
    
    # Insert default settings if not exists
    conn.execute("""
        INSERT OR IGNORE INTO settings (id, e1rm_formula, unit_preference, theme_preference)
        VALUES (1, 'epley', 'kg', 'system')
    """)
    conn.commit()


def read_csv(filepath: Path) -> list[dict]:
    """Read CSV file and return list of row dictionaries (Strength section only)."""
    rows = []
    
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()
    
    # Find the Strength section
    in_strength_section = False
    header_line = None
    data_lines = []
    
    for line in lines:
        stripped = line.strip()
        
        # Check for section markers
        if stripped.startswith('-----'):
            if 'Strength' in stripped:
                in_strength_section = True
                continue
            elif in_strength_section:
                # We've hit the next section, stop
                break
        elif in_strength_section:
            if header_line is None:
                header_line = stripped
            else:
                if stripped:  # Skip empty lines
                    data_lines.append(stripped)
    
    if not header_line:
        print("Warning: No Strength section found, trying to parse entire file...")
        # Fallback: try to read the whole file
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            first_line = f.readline().strip()
            if first_line.startswith('-----'):
                pass
            else:
                f.seek(0)
            reader = csv.DictReader(f)
            for row in reader:
                clean_row = {}
                for key, value in row.items():
                    if key:
                        clean_key = key.strip()
                        clean_row[clean_key] = value.strip() if value else ''
                if clean_row:
                    rows.append(clean_row)
        return rows
    
    # Parse the strength data
    import io
    csv_content = header_line + '\n' + '\n'.join(data_lines)
    reader = csv.DictReader(io.StringIO(csv_content))
    
    for row in reader:
        clean_row = {}
        for key, value in row.items():
            if key:
                clean_key = key.strip()
                clean_row[clean_key] = value.strip() if value else ''
        if clean_row:
            rows.append(clean_row)
    
    return rows


def convert_csv_to_db(csv_path: Path, db_path: Path):
    """Convert CSV file to SQLite database."""
    print(f"Reading CSV from: {csv_path}")
    rows = read_csv(csv_path)
    print(f"Found {len(rows)} data rows")
    
    if not rows:
        print("Error: No data rows found in CSV")
        sys.exit(1)
    
    # Remove existing db file if present
    if db_path.exists():
        db_path.unlink()
    
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = OFF")  # Disable during bulk insert
    
    print("Creating database schema...")
    create_schema(conn)
    
    # Track created entities
    exercises: dict[str, int] = {}  # name -> id
    workouts: dict[str, int] = {}   # date_str -> id
    workout_exercises: dict[tuple[int, int], int] = {}  # (workout_id, exercise_id) -> id
    
    # Group rows by date to create workouts
    rows_by_date: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        date_str = row.get('Date', '')
        if date_str:
            rows_by_date[date_str].append(row)
    
    print(f"Found {len(rows_by_date)} unique workout days")
    
    # Process each workout day
    set_count = 0
    exercise_order = 0
    
    for date_str in sorted(rows_by_date.keys(), reverse=True):
        day_rows = rows_by_date[date_str]
        
        # Find earliest time for this day to set workout start
        earliest_time = min(row.get('Time', '00:00') for row in day_rows)
        latest_time = max(row.get('Time', '00:00') for row in day_rows)
        
        workout_started_at = parse_datetime(date_str, earliest_time)
        workout_completed_at = parse_datetime(date_str, latest_time)
        
        # Create workout
        workout_uid = generate_uid()
        cursor = conn.execute(
            "INSERT INTO workouts (uid, started_at, completed_at) VALUES (?, ?, ?)",
            (workout_uid, workout_started_at, workout_completed_at)
        )
        workout_id = cursor.lastrowid
        workouts[date_str] = workout_id
        
        # Group by exercise within the day
        exercises_for_day: dict[str, list[dict]] = defaultdict(list)
        for row in day_rows:
            exercise_name = row.get('Exercise', '').strip()
            if exercise_name:
                exercises_for_day[exercise_name].append(row)
        
        exercise_order = 0
        for exercise_name, exercise_rows in exercises_for_day.items():
            # Create exercise if not exists
            if exercise_name not in exercises:
                exercise_uid = generate_uid()
                cursor = conn.execute(
                    "INSERT INTO exercises (uid, name, created_at) VALUES (?, ?, ?)",
                    (exercise_uid, exercise_name, workout_started_at)
                )
                exercises[exercise_name] = cursor.lastrowid
            
            exercise_id = exercises[exercise_name]
            
            # Create workout_exercise entry
            we_key = (workout_id, exercise_id)
            if we_key not in workout_exercises:
                # Get performed_at from first set of this exercise
                first_row = exercise_rows[0]
                performed_at = parse_datetime(first_row.get('Date', date_str), first_row.get('Time', '00:00'))
                
                # Get note from first set if present
                first_note = first_row.get('Notes', '').strip()
                
                we_uid = generate_uid()
                cursor = conn.execute(
                    """INSERT INTO workout_exercises 
                       (uid, workout_id, exercise_id, order_index, note, performed_at, completed_at) 
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (we_uid, workout_id, exercise_id, exercise_order, 
                     first_note if first_note else None, performed_at, performed_at)
                )
                workout_exercises[we_key] = cursor.lastrowid
                exercise_order += 1
            
            we_id = workout_exercises[we_key]
            
            # Create sets for this exercise
            set_index = 0
            for row in exercise_rows:
                performed_at = parse_datetime(row.get('Date', date_str), row.get('Time', '00:00'))
                
                # Parse weight and reps
                weight_str = row.get('Weight', '').strip()
                reps_str = row.get('# of Reps', '').strip()
                note = row.get('Notes', '').strip()
                
                weight = float(weight_str) if weight_str else None
                reps = int(reps_str) if reps_str else None
                
                set_uid = generate_uid()
                conn.execute(
                    """INSERT INTO sets 
                       (uid, workout_id, exercise_id, workout_exercise_id, set_index, 
                        weight_kg, reps, note, performed_at, is_warmup) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (set_uid, workout_id, exercise_id, we_id, set_index,
                     weight, reps, note if note else None, performed_at, 0)
                )
                set_index += 1
                set_count += 1
    
    conn.execute("PRAGMA foreign_keys = ON")
    conn.commit()
    conn.close()
    
    print(f"\nConversion complete!")
    print(f"  - Exercises: {len(exercises)}")
    print(f"  - Workouts: {len(workouts)}")
    print(f"  - Workout exercises: {len(workout_exercises)}")
    print(f"  - Sets: {set_count}")
    print(f"\nOutput saved to: {db_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python csv_to_backup.py <input.csv> [output.db]")
        print("\nConverts a WorkoutLog CSV export to a SQLite backup file.")
        sys.exit(1)
    
    csv_path = Path(sys.argv[1])
    
    if len(sys.argv) >= 3:
        db_path = Path(sys.argv[2])
    else:
        db_path = csv_path.with_suffix('.db')
    
    if not csv_path.exists():
        print(f"Error: CSV file not found: {csv_path}")
        sys.exit(1)
    
    convert_csv_to_db(csv_path, db_path)


if __name__ == "__main__":
    main()
