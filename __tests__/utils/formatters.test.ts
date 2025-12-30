/**
 * Tests for shared formatter utilities
 */
import {
  formatTime,
  formatRelativeDate,
  formatHistoryDate,
  formatHistoryTime,
  formatDate,
} from '../../lib/utils/formatters';

describe('formatTime (seconds to MM:SS)', () => {
  it('formats 0 seconds as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats 30 seconds as 00:30', () => {
    expect(formatTime(30)).toBe('00:30');
  });

  it('formats 60 seconds as 01:00', () => {
    expect(formatTime(60)).toBe('01:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatTime(90)).toBe('01:30');
  });

  it('formats 120 seconds as 02:00', () => {
    expect(formatTime(120)).toBe('02:00');
  });

  it('formats 599 seconds as 09:59', () => {
    expect(formatTime(599)).toBe('09:59');
  });

  it('formats 3599 seconds as 59:59', () => {
    expect(formatTime(3599)).toBe('59:59');
  });

  it('formats 3600 seconds as 60:00 (1 hour)', () => {
    expect(formatTime(3600)).toBe('60:00');
  });

  it('pads single digit minutes with leading zero', () => {
    expect(formatTime(65)).toBe('01:05');
  });

  it('pads single digit seconds with leading zero', () => {
    expect(formatTime(5)).toBe('00:05');
  });
});

describe('formatRelativeDate (relative date formatting)', () => {
  it('returns "Today" for today\'s date', () => {
    const today = new Date();
    expect(formatRelativeDate(today)).toBe('Today');
  });

  it('returns "Yesterday" for yesterday\'s date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatRelativeDate(yesterday)).toBe('Yesterday');
  });

  it('returns formatted date for dates older than yesterday', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 7);
    const result = formatRelativeDate(oldDate);
    
    // Should contain weekday abbreviation
    expect(result).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    // Should contain month abbreviation
    expect(result).toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
    // Should contain day number
    expect(result).toMatch(/\d+/);
  });

  it('handles midnight boundary correctly', () => {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    expect(formatRelativeDate(todayMidnight)).toBe('Today');
  });

  it('handles end of day correctly', () => {
    const todayEndOfDay = new Date();
    todayEndOfDay.setHours(23, 59, 59, 999);
    expect(formatRelativeDate(todayEndOfDay)).toBe('Today');
  });

  it('returns formatted date for future dates', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const result = formatRelativeDate(tomorrow);
    
    // Future dates should not be "Today" or "Yesterday"
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Yesterday');
  });
});

describe('formatDate (alias for formatRelativeDate)', () => {
  it('is an alias for formatRelativeDate', () => {
    const date = new Date();
    expect(formatDate(date)).toBe(formatRelativeDate(date));
  });

  it('returns "Today" for today\'s date', () => {
    expect(formatDate(new Date())).toBe('Today');
  });
});

describe('formatHistoryDate (timestamp to date string)', () => {
  it('formats timestamp correctly', () => {
    // January 15, 2024
    const timestamp = new Date(2024, 0, 15).getTime();
    expect(formatHistoryDate(timestamp)).toBe('Jan 15, 2024');
  });

  it('handles current timestamp', () => {
    const now = Date.now();
    const result = formatHistoryDate(now);
    
    // Should be a valid date string format
    expect(result).toMatch(/[A-Za-z]+ \d+, \d{4}/);
  });

  it('formats December date correctly', () => {
    const timestamp = new Date(2023, 11, 25).getTime();
    expect(formatHistoryDate(timestamp)).toBe('Dec 25, 2023');
  });
});

describe('formatHistoryTime (timestamp to time string)', () => {
  it('formats morning time correctly', () => {
    const date = new Date(2024, 0, 15, 9, 30);
    const result = formatHistoryTime(date.getTime());
    expect(result).toMatch(/9:30\s*AM/i);
  });

  it('formats afternoon time correctly', () => {
    const date = new Date(2024, 0, 15, 14, 45);
    const result = formatHistoryTime(date.getTime());
    expect(result).toMatch(/2:45\s*PM/i);
  });

  it('formats midnight correctly', () => {
    const date = new Date(2024, 0, 15, 0, 0);
    const result = formatHistoryTime(date.getTime());
    expect(result).toMatch(/12:00\s*AM/i);
  });

  it('formats noon correctly', () => {
    const date = new Date(2024, 0, 15, 12, 0);
    const result = formatHistoryTime(date.getTime());
    expect(result).toMatch(/12:00\s*PM/i);
  });
});

describe('Edge Cases', () => {
  describe('formatTime edge cases', () => {
    it('handles negative seconds by returning negative result', () => {
      // Current implementation doesn't guard against negative, returns as-is
      const result = formatTime(-60);
      // Math.floor(-60/60) = -1, -60 % 60 = 0
      expect(result).toBe('-1:00');
    });

    it('handles very large values', () => {
      // 100 minutes = 6000 seconds
      expect(formatTime(6000)).toBe('100:00');
    });
  });

  describe('formatRelativeDate edge cases', () => {
    it('handles date at timezone boundary', () => {
      const today = new Date();
      today.setHours(0, 0, 0, 1); // 1ms after midnight
      expect(formatRelativeDate(today)).toBe('Today');
    });

    it('handles year boundary', () => {
      const newYear = new Date(2024, 0, 1);
      const result = formatRelativeDate(newYear);
      // Should contain "Jan" and "1"
      expect(result).toMatch(/Jan/);
    });
  });
});
