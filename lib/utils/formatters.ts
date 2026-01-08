/**
 * Shared formatting utilities for dates and times
 * 
 * This module consolidates formatting functions that were previously
 * duplicated across multiple components:
 * - RecordTab.tsx
 * - edit-workout.tsx
 * - HistoryTab.tsx
 * - TimerModal.tsx
 * - timerStore.ts
 */

/**
 * Format seconds into MM:SS format
 * Used for timer displays
 * 
 * @param seconds - Number of seconds to format
 * @returns Formatted string like "01:30"
 * 
 * @example
 * formatTime(90) // "01:30"
 * formatTime(0)  // "00:00"
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format a date relative to today
 * Returns "Today", "Yesterday", or formatted date
 * 
 * @param date - Date to format
 * @returns "Today", "Yesterday", or formatted date string
 * 
 * @example
 * formatRelativeDate(new Date()) // "Today"
 */
export function formatRelativeDate(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  if (isToday) {
    return 'Today';
  }
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a timestamp into a date string
 * Used in history views
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted date string like "Jan 15, 2024"
 */
export function formatHistoryDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a timestamp into a time string
 * Used in history views
 * 
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Formatted time string like "9:30 AM"
 */
export function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Alias for backwards compatibility with existing code
export const formatDate = formatRelativeDate;








