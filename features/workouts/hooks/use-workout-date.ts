import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/** Follow the local day across midnight while preserving deliberate date browsing. */
export function useWorkoutDate() {
  const [date, setDate] = useState(() => new Date());
  const selectedDate = useRef(date);
  const lastToday = useRef(new Date().toDateString());
  const selectDate = useCallback((next: Date) => {
    selectedDate.current = next;
    setDate(next);
  }, []);
  const refreshToday = useCallback(() => {
    const now = new Date();
    const nextToday = now.toDateString();
    if (nextToday !== lastToday.current && selectedDate.current.toDateString() === lastToday.current) {
      selectDate(now);
    }
    lastToday.current = nextToday;
  }, [selectDate]);

  useFocusEffect(useCallback(() => { refreshToday(); }, [refreshToday]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshToday();
    });
    return () => subscription.remove();
  }, [refreshToday]);
  return { date, setDate: selectDate };
}
