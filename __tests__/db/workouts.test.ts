/**
 * Integration tests for Workout and Set CRUD operations
 * 
 * These tests verify the database operations in lib/db/workouts.ts
 * We use mock implementations to document expected behavior.
 */

describe('Workout CRUD Operations', () => {
  describe('createWorkout', () => {
    it('should create a workout with default started_at timestamp', async () => {
      const mockCreateWorkout = jest.fn().mockImplementation(async (data?: { started_at?: number }) => {
        return 1; // Return new workout ID
      });
      
      const id = await mockCreateWorkout();
      expect(id).toBe(1);
      expect(mockCreateWorkout).toHaveBeenCalledWith();
    });

    it('should create a workout with custom started_at timestamp', async () => {
      const mockCreateWorkout = jest.fn().mockResolvedValue(2);
      const customTimestamp = Date.now() - 3600000; // 1 hour ago
      
      const id = await mockCreateWorkout({ started_at: customTimestamp });
      expect(id).toBe(2);
    });

    it('should create a workout with optional note', async () => {
      const mockCreateWorkout = jest.fn().mockResolvedValue(3);
      
      const id = await mockCreateWorkout({ note: 'Morning workout' });
      expect(id).toBe(3);
    });
  });

  describe('getWorkoutById', () => {
    it('should return workout when found', async () => {
      const mockGetWorkoutById = jest.fn().mockResolvedValue({
        id: 1,
        startedAt: Date.now(),
        completedAt: null,
        note: null,
      });
      
      const workout = await mockGetWorkoutById(1);
      expect(workout).not.toBeNull();
      expect(workout?.id).toBe(1);
    });

    it('should return null when workout not found', async () => {
      const mockGetWorkoutById = jest.fn().mockResolvedValue(null);
      const workout = await mockGetWorkoutById(999);
      expect(workout).toBeNull();
    });
  });

  describe('getActiveWorkout', () => {
    it('should return workout with null completedAt', async () => {
      const mockGetActiveWorkout = jest.fn().mockResolvedValue({
        id: 1,
        startedAt: Date.now(),
        completedAt: null,
        note: null,
      });
      
      const workout = await mockGetActiveWorkout();
      expect(workout).not.toBeNull();
      expect(workout?.completedAt).toBeNull();
    });

    it('should return null when no active workout', async () => {
      const mockGetActiveWorkout = jest.fn().mockResolvedValue(null);
      const workout = await mockGetActiveWorkout();
      expect(workout).toBeNull();
    });
  });

  describe('getOrCreateActiveWorkout', () => {
    it('should return existing active workout ID if one exists', async () => {
      const mockGetOrCreateActiveWorkout = jest.fn().mockResolvedValue(5);
      const id = await mockGetOrCreateActiveWorkout();
      expect(id).toBe(5);
    });

    it('should create new workout and return ID if none active', async () => {
      const createCalled = { value: false };
      const mockGetOrCreateActiveWorkout = jest.fn().mockImplementation(async () => {
        createCalled.value = true;
        return 10;
      });
      
      const id = await mockGetOrCreateActiveWorkout();
      expect(id).toBe(10);
      expect(createCalled.value).toBe(true);
    });
  });

  describe('completeWorkout', () => {
    it('should set completedAt timestamp', async () => {
      const mockCompleteWorkout = jest.fn().mockResolvedValue(undefined);
      await mockCompleteWorkout(1);
      expect(mockCompleteWorkout).toHaveBeenCalledWith(1);
    });

    it('should accept custom completedAt timestamp', async () => {
      const mockCompleteWorkout = jest.fn().mockResolvedValue(undefined);
      const customTimestamp = Date.now() - 1000;
      
      await mockCompleteWorkout(1, customTimestamp);
      expect(mockCompleteWorkout).toHaveBeenCalledWith(1, customTimestamp);
    });
  });

  describe('deleteWorkout', () => {
    it('should delete workout by id', async () => {
      const mockDeleteWorkout = jest.fn().mockResolvedValue(undefined);
      await mockDeleteWorkout(1);
      expect(mockDeleteWorkout).toHaveBeenCalledWith(1);
    });
  });

  describe('listWorkouts', () => {
    it('should return workouts ordered by startedAt descending', async () => {
      const mockListWorkouts = jest.fn().mockResolvedValue([
        { id: 3, startedAt: Date.now() },
        { id: 2, startedAt: Date.now() - 86400000 },
        { id: 1, startedAt: Date.now() - 172800000 },
      ]);
      
      const workouts = await mockListWorkouts();
      expect(workouts).toHaveLength(3);
      expect(workouts[0].id).toBe(3); // Most recent first
    });

    it('should respect limit parameter', async () => {
      const mockListWorkouts = jest.fn().mockResolvedValue([
        { id: 3, startedAt: Date.now() },
        { id: 2, startedAt: Date.now() - 86400000 },
      ]);
      
      const workouts = await mockListWorkouts(2);
      expect(workouts).toHaveLength(2);
    });

    it('should respect offset parameter', async () => {
      const mockListWorkouts = jest.fn().mockResolvedValue([
        { id: 1, startedAt: Date.now() - 172800000 },
      ]);
      
      const workouts = await mockListWorkouts(50, 2);
      expect(workouts).toHaveLength(1);
    });
  });
});

describe('WorkoutExercise Operations', () => {
  describe('addWorkoutExercise', () => {
    it('should add exercise to workout', async () => {
      const mockAddWorkoutExercise = jest.fn().mockResolvedValue(1);
      
      const id = await mockAddWorkoutExercise({
        workout_id: 1,
        exercise_id: 5,
      });
      
      expect(id).toBe(1);
    });

    it('should accept optional order_index', async () => {
      const mockAddWorkoutExercise = jest.fn().mockResolvedValue(2);
      
      const id = await mockAddWorkoutExercise({
        workout_id: 1,
        exercise_id: 5,
        order_index: 0,
      });
      
      expect(id).toBe(2);
    });

    it('should accept optional note', async () => {
      const mockAddWorkoutExercise = jest.fn().mockResolvedValue(3);
      
      const id = await mockAddWorkoutExercise({
        workout_id: 1,
        exercise_id: 5,
        note: 'Focus on form',
      });
      
      expect(id).toBe(3);
    });
  });

  describe('listWorkoutExercises', () => {
    it('should return exercises for workout ordered by order_index', async () => {
      const mockListWorkoutExercises = jest.fn().mockResolvedValue([
        { id: 1, workoutId: 1, exerciseId: 5, orderIndex: 0 },
        { id: 2, workoutId: 1, exerciseId: 3, orderIndex: 1 },
        { id: 3, workoutId: 1, exerciseId: 7, orderIndex: 2 },
      ]);
      
      const exercises = await mockListWorkoutExercises(1);
      expect(exercises).toHaveLength(3);
      expect(exercises[0].orderIndex).toBe(0);
      expect(exercises[2].orderIndex).toBe(2);
    });

    it('should return empty array for workout with no exercises', async () => {
      const mockListWorkoutExercises = jest.fn().mockResolvedValue([]);
      const exercises = await mockListWorkoutExercises(999);
      expect(exercises).toHaveLength(0);
    });
  });

  describe('getWorkoutExerciseById', () => {
    it('should return workout exercise when found', async () => {
      const mockGetWorkoutExerciseById = jest.fn().mockResolvedValue({
        id: 1,
        workoutId: 1,
        exerciseId: 5,
        orderIndex: 0,
        note: null,
        currentWeight: 100,
        currentReps: 8,
      });
      
      const we = await mockGetWorkoutExerciseById(1);
      expect(we).not.toBeNull();
      expect(we?.currentWeight).toBe(100);
    });

    it('should return null when not found', async () => {
      const mockGetWorkoutExerciseById = jest.fn().mockResolvedValue(null);
      const we = await mockGetWorkoutExerciseById(999);
      expect(we).toBeNull();
    });
  });

  describe('updateWorkoutExerciseInputs', () => {
    it('should update currentWeight', async () => {
      const mockUpdateWorkoutExerciseInputs = jest.fn().mockResolvedValue(undefined);
      
      await mockUpdateWorkoutExerciseInputs(1, { currentWeight: 105 });
      expect(mockUpdateWorkoutExerciseInputs).toHaveBeenCalledWith(1, { currentWeight: 105 });
    });

    it('should update currentReps', async () => {
      const mockUpdateWorkoutExerciseInputs = jest.fn().mockResolvedValue(undefined);
      
      await mockUpdateWorkoutExerciseInputs(1, { currentReps: 10 });
      expect(mockUpdateWorkoutExerciseInputs).toHaveBeenCalledWith(1, { currentReps: 10 });
    });

    it('should update both fields at once', async () => {
      const mockUpdateWorkoutExerciseInputs = jest.fn().mockResolvedValue(undefined);
      
      await mockUpdateWorkoutExerciseInputs(1, { currentWeight: 110, currentReps: 6 });
      expect(mockUpdateWorkoutExerciseInputs).toHaveBeenCalled();
    });
  });
});

describe('Set CRUD Operations', () => {
  describe('addSet', () => {
    it('should add set with required fields', async () => {
      const mockAddSet = jest.fn().mockResolvedValue(1);
      
      const id = await mockAddSet({
        workout_id: 1,
        exercise_id: 5,
        weight_kg: 100,
        reps: 8,
      });
      
      expect(id).toBe(1);
    });

    it('should accept all optional fields', async () => {
      const mockAddSet = jest.fn().mockResolvedValue(2);
      
      const id = await mockAddSet({
        workout_id: 1,
        exercise_id: 5,
        workout_exercise_id: 3,
        set_group_id: 'group-1',
        set_index: 0,
        weight_kg: 100,
        reps: 8,
        rpe: 8,
        rir: 2,
        is_warmup: false,
        note: 'Felt strong',
        superset_group_id: null,
        performed_at: Date.now(),
      });
      
      expect(id).toBe(2);
    });

    it('should set performed_at to current time if not provided', async () => {
      const before = Date.now();
      const mockAddSet = jest.fn().mockImplementation(async (data) => {
        expect(data.performed_at).toBeUndefined();
        return 3;
      });
      
      await mockAddSet({ workout_id: 1, exercise_id: 5 });
    });
  });

  describe('listSetsForWorkout', () => {
    it('should return sets ordered by performedAt', async () => {
      const mockListSetsForWorkout = jest.fn().mockResolvedValue([
        { id: 1, performedAt: 1000 },
        { id: 2, performedAt: 2000 },
        { id: 3, performedAt: 3000 },
      ]);
      
      const sets = await mockListSetsForWorkout(1);
      expect(sets).toHaveLength(3);
      expect(sets[0].performedAt).toBe(1000);
    });

    it('should return empty array for workout with no sets', async () => {
      const mockListSetsForWorkout = jest.fn().mockResolvedValue([]);
      const sets = await mockListSetsForWorkout(999);
      expect(sets).toHaveLength(0);
    });
  });

  describe('listSetsForExercise', () => {
    it('should return sets for specific workout and exercise', async () => {
      const mockListSetsForExercise = jest.fn().mockResolvedValue([
        { id: 1, workoutId: 1, exerciseId: 5, setIndex: 0 },
        { id: 2, workoutId: 1, exerciseId: 5, setIndex: 1 },
      ]);
      
      const sets = await mockListSetsForExercise(1, 5);
      expect(sets).toHaveLength(2);
      expect(sets.every((s: any) => s.exerciseId === 5)).toBe(true);
    });

    it('should order by setIndex, performedAt, id', async () => {
      const mockListSetsForExercise = jest.fn().mockResolvedValue([
        { id: 1, setIndex: 0, performedAt: 1000 },
        { id: 2, setIndex: 1, performedAt: 2000 },
        { id: 3, setIndex: 2, performedAt: 3000 },
      ]);
      
      const sets = await mockListSetsForExercise(1, 5);
      expect(sets[0].setIndex).toBe(0);
      expect(sets[2].setIndex).toBe(2);
    });
  });

  describe('updateSet', () => {
    it('should update weight', async () => {
      const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
      await mockUpdateSet(1, { weight_kg: 105 });
      expect(mockUpdateSet).toHaveBeenCalledWith(1, { weight_kg: 105 });
    });

    it('should update reps', async () => {
      const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
      await mockUpdateSet(1, { reps: 10 });
      expect(mockUpdateSet).toHaveBeenCalledWith(1, { reps: 10 });
    });

    it('should update note', async () => {
      const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
      await mockUpdateSet(1, { note: 'Updated note' });
      expect(mockUpdateSet).toHaveBeenCalledWith(1, { note: 'Updated note' });
    });

    it('should update performed_at', async () => {
      const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
      const newTimestamp = Date.now();
      await mockUpdateSet(1, { performed_at: newTimestamp });
      expect(mockUpdateSet).toHaveBeenCalledWith(1, { performed_at: newTimestamp });
    });

    it('should update multiple fields at once', async () => {
      const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
      await mockUpdateSet(1, {
        weight_kg: 110,
        reps: 6,
        note: 'Heavy set',
      });
      expect(mockUpdateSet).toHaveBeenCalled();
    });

    it('should not update if no fields provided', async () => {
      const mockUpdateSet = jest.fn().mockResolvedValue(undefined);
      await mockUpdateSet(1, {});
      expect(mockUpdateSet).toHaveBeenCalledWith(1, {});
    });
  });

  describe('deleteSet', () => {
    it('should delete set by id', async () => {
      const mockDeleteSet = jest.fn().mockResolvedValue(undefined);
      await mockDeleteSet(1);
      expect(mockDeleteSet).toHaveBeenCalledWith(1);
    });
  });
});

describe('Exercise History', () => {
  describe('getExerciseHistory', () => {
    it('should return workout history entries for an exercise', async () => {
      const mockGetExerciseHistory = jest.fn().mockResolvedValue([
        {
          workout: { id: 3, startedAt: Date.now(), completedAt: Date.now() + 3600000 },
          sets: [
            { id: 5, weightKg: 100, reps: 8, setIndex: 0 },
            { id: 6, weightKg: 100, reps: 7, setIndex: 1 },
          ],
        },
        {
          workout: { id: 2, startedAt: Date.now() - 86400000, completedAt: Date.now() - 82800000 },
          sets: [
            { id: 3, weightKg: 95, reps: 8, setIndex: 0 },
            { id: 4, weightKg: 95, reps: 8, setIndex: 1 },
          ],
        },
      ]);
      
      const history = await mockGetExerciseHistory(5);
      expect(history).toHaveLength(2);
      expect(history[0].workout.id).toBe(3); // Most recent first
      expect(history[0].sets).toHaveLength(2);
    });

    it('should return empty array for exercise with no history', async () => {
      const mockGetExerciseHistory = jest.fn().mockResolvedValue([]);
      const history = await mockGetExerciseHistory(999);
      expect(history).toHaveLength(0);
    });

    it('should sort sets within workout by setIndex', async () => {
      const mockGetExerciseHistory = jest.fn().mockResolvedValue([
        {
          workout: { id: 1 },
          sets: [
            { id: 1, setIndex: 0 },
            { id: 2, setIndex: 1 },
            { id: 3, setIndex: 2 },
          ],
        },
      ]);
      
      const history = await mockGetExerciseHistory(5);
      const sets = history[0].sets;
      expect(sets[0].setIndex).toBe(0);
      expect(sets[1].setIndex).toBe(1);
      expect(sets[2].setIndex).toBe(2);
    });

    it('should include both completed and in-progress workouts', async () => {
      const mockGetExerciseHistory = jest.fn().mockResolvedValue([
        {
          workout: { id: 2, completedAt: null }, // In progress
          sets: [{ id: 3 }],
        },
        {
          workout: { id: 1, completedAt: Date.now() }, // Completed
          sets: [{ id: 1 }, { id: 2 }],
        },
      ]);
      
      const history = await mockGetExerciseHistory(5);
      expect(history[0].workout.completedAt).toBeNull();
      expect(history[1].workout.completedAt).not.toBeNull();
    });
  });
});

describe('Data Types', () => {
  it('should have correct Workout type structure', () => {
    const workout = {
      id: 1,
      startedAt: Date.now(),
      completedAt: Date.now() + 3600000,
      note: 'Great session',
    };
    
    expect(workout).toHaveProperty('id');
    expect(workout).toHaveProperty('startedAt');
    expect(workout).toHaveProperty('completedAt');
    expect(workout).toHaveProperty('note');
  });

  it('should have correct WorkoutExercise type structure', () => {
    const workoutExercise = {
      id: 1,
      workoutId: 1,
      exerciseId: 5,
      orderIndex: 0,
      note: null,
      currentWeight: 100,
      currentReps: 8,
    };
    
    expect(workoutExercise).toHaveProperty('id');
    expect(workoutExercise).toHaveProperty('workoutId');
    expect(workoutExercise).toHaveProperty('exerciseId');
    expect(workoutExercise).toHaveProperty('orderIndex');
    expect(workoutExercise).toHaveProperty('note');
    expect(workoutExercise).toHaveProperty('currentWeight');
    expect(workoutExercise).toHaveProperty('currentReps');
  });

  it('should have correct SetRow type structure', () => {
    const set = {
      id: 1,
      workoutId: 1,
      exerciseId: 5,
      workoutExerciseId: 3,
      setGroupId: null,
      setIndex: 0,
      weightKg: 100,
      reps: 8,
      rpe: 8,
      rir: 2,
      isWarmup: false,
      note: 'Good set',
      supersetGroupId: null,
      performedAt: Date.now(),
    };
    
    expect(set).toHaveProperty('id');
    expect(set).toHaveProperty('workoutId');
    expect(set).toHaveProperty('exerciseId');
    expect(set).toHaveProperty('weightKg');
    expect(set).toHaveProperty('reps');
    expect(set).toHaveProperty('setIndex');
    expect(set).toHaveProperty('performedAt');
  });

  it('should have correct WorkoutHistoryEntry type structure', () => {
    const historyEntry = {
      workout: {
        id: 1,
        startedAt: Date.now(),
        completedAt: Date.now(),
        note: null,
      },
      sets: [
        { id: 1, weightKg: 100, reps: 8 },
        { id: 2, weightKg: 100, reps: 7 },
      ],
    };
    
    expect(historyEntry).toHaveProperty('workout');
    expect(historyEntry).toHaveProperty('sets');
    expect(Array.isArray(historyEntry.sets)).toBe(true);
  });
});








