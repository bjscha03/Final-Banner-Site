/**
 * Delivery Time Helpers
 * 
 * All business logic runs in America/Kentucky/Louisville timezone.
 * User display is converted to their local timezone.
 * 
 * Algorithm:
 * 1. Check if current time is before cutoff on a business day
 * 2. If yes: production starts now, completes in 24h
 * 3. If no: production starts next business day at businessStartHour
 * 4. After production, add 1 business day for Next Day Air shipping
 * 5. Weekend/holiday handling: push to next Monday/business day
 */

// Business timezone for all calculations
export const BUSINESS_TIMEZONE = 'America/Kentucky/Louisville';

// Blackout dates (holidays) - add dates in 'YYYY-MM-DD' format
export const BLACKOUT_DATES: string[] = [
  // '2026-01-01', // New Year's Day
  // '2026-12-25', // Christmas
];

export interface DeliveryConfig {
  cutoffHour: number;        // Default: 14 (2 PM ET)
  businessStartHour: number; // Default: 9 (9 AM ET)
  blackoutDates?: string[];
}

export const DEFAULT_CONFIG: DeliveryConfig = {
  cutoffHour: 14,
  businessStartHour: 9,
  blackoutDates: BLACKOUT_DATES,
};

/**
 * Format a date to 'YYYY-MM-DD' in a specific timezone
 */
export function formatDateInTz(date: Date, timezone: string): string {
  return date.toLocaleDateString('en-CA', { timeZone: timezone });
}

/**
 * Get hour in a specific timezone (0-23)
 */
export function getHourInTz(date: Date, timezone: string): number {
  return parseInt(date.toLocaleString('en-US', { 
    timeZone: timezone, 
    hour: 'numeric', 
    hour12: false 
  }), 10);
}

/**
 * Get minutes in a specific timezone
 */
export function getMinutesInTz(date: Date, timezone: string): number {
  return parseInt(date.toLocaleString('en-US', { 
    timeZone: timezone, 
    minute: '2-digit' 
  }), 10);
}

/**
 * Get day of week in a specific timezone (0 = Sunday, 6 = Saturday)
 */
export function getDayOfWeekInTz(date: Date, timezone: string): number {
  const dayStr = date.toLocaleDateString('en-US', { 
    timeZone: timezone, 
    weekday: 'short' 
  });
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days.indexOf(dayStr);
}

/**
 * Check if a date is a weekend in business timezone
 */
export function isWeekend(date: Date, timezone: string = BUSINESS_TIMEZONE): boolean {
  const day = getDayOfWeekInTz(date, timezone);
  return day === 0 || day === 6;
}

/**
 * Check if a date is a blackout date (holiday)
 */
export function isBlackoutDate(date: Date, blackoutDates: string[] = BLACKOUT_DATES): boolean {
  const dateStr = formatDateInTz(date, BUSINESS_TIMEZONE);
  return blackoutDates.includes(dateStr);
}

/**
 * Check if a date is a business day
 */
export function isBusinessDay(
  date: Date, 
  timezone: string = BUSINESS_TIMEZONE,
  blackoutDates: string[] = BLACKOUT_DATES
): boolean {
  return !isWeekend(date, timezone) && !isBlackoutDate(date, blackoutDates);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add hours to a date
 */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Get next business day from a given date
 */
export function getNextBusinessDay(
  date: Date,
  blackoutDates: string[] = BLACKOUT_DATES
): Date {
  let next = addDays(date, 1);
  while (!isBusinessDay(next, BUSINESS_TIMEZONE, blackoutDates)) {
    next = addDays(next, 1);
  }
  return next;
}

/**
 * Ensure date is a business day, advancing if necessary
 */
export function ensureBusinessDay(
  date: Date,
  blackoutDates: string[] = BLACKOUT_DATES
): Date {
  let result = new Date(date);
  while (!isBusinessDay(result, BUSINESS_TIMEZONE, blackoutDates)) {
    result = addDays(result, 1);
  }
  return result;
}

/**
 * Create a Date object set to a specific hour in business timezone on a given day
 */
export function setHourInBusinessTz(date: Date, targetHour: number): Date {
  const dateStr = formatDateInTz(date, BUSINESS_TIMEZONE);
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Initial guess: EST is UTC-5, EDT is UTC-4
  let guess = new Date(Date.UTC(year, month - 1, day, targetHour + 5, 0, 0, 0));
  
  // Iterate to handle DST correctly
  for (let attempt = 0; attempt < 48; attempt++) {
    const currentHour = getHourInTz(guess, BUSINESS_TIMEZONE);
    const currentDateStr = formatDateInTz(guess, BUSINESS_TIMEZONE);
    
    if (currentHour === targetHour && currentDateStr === dateStr) {
      return guess;
    }
    
    const diff = targetHour - currentHour;
    guess = addHours(guess, diff || 1);
  }
  
  return guess;
}

/**
 * Get the next cutoff time in business timezone
 * If before cutoff today (and it's a business day), returns today's cutoff
 * Otherwise returns next business day's cutoff
 */
export function getNextCutoffTime(
  now: Date,
  config: DeliveryConfig = DEFAULT_CONFIG
): Date {
  const currentHour = getHourInTz(now, BUSINESS_TIMEZONE);
  const currentMinutes = getMinutesInTz(now, BUSINESS_TIMEZONE);
  const currentTimeInHours = currentHour + currentMinutes / 60;
  
  const isBizDay = isBusinessDay(now, BUSINESS_TIMEZONE, config.blackoutDates || []);
  const beforeCutoff = currentTimeInHours < config.cutoffHour;
  
  if (isBizDay && beforeCutoff) {
    // Today's cutoff
    return setHourInBusinessTz(now, config.cutoffHour);
  } else {
    // Next business day's cutoff
    const nextBizDay = getNextBusinessDay(now, config.blackoutDates || []);
    return setHourInBusinessTz(nextBizDay, config.cutoffHour);
  }
}

/**
 * Calculate estimated delivery date
 * Production: 24 hours (must complete on business day)
 * Shipping: Next business day
 */
export function getEstimatedDeliveryDate(
  orderTime: Date,
  config: DeliveryConfig = DEFAULT_CONFIG
): Date {
  const currentHour = getHourInTz(orderTime, BUSINESS_TIMEZONE);
  const currentMinutes = getMinutesInTz(orderTime, BUSINESS_TIMEZONE);
  const currentTimeInHours = currentHour + currentMinutes / 60;
  
  const isBizDay = isBusinessDay(orderTime, BUSINESS_TIMEZONE, config.blackoutDates || []);
  const beforeCutoff = currentTimeInHours < config.cutoffHour;
  
  let productionStart: Date;
  
  if (isBizDay && beforeCutoff) {
    // Production starts immediately
    productionStart = orderTime;
  } else {
    // Production starts next business day at business start hour
    const nextBizDay = isBizDay 
      ? getNextBusinessDay(orderTime, config.blackoutDates || [])
      : ensureBusinessDay(orderTime, config.blackoutDates || []);
    productionStart = setHourInBusinessTz(nextBizDay, config.businessStartHour);
  }
  
  // Add 24 hours for production
  let productionComplete = addHours(productionStart, 24);
  
  // If production completes on weekend/holiday, push to next business day 9 AM
  if (!isBusinessDay(productionComplete, BUSINESS_TIMEZONE, config.blackoutDates || [])) {
    const nextBizDay = ensureBusinessDay(productionComplete, config.blackoutDates || []);
    productionComplete = setHourInBusinessTz(nextBizDay, config.businessStartHour);
  }
  
  // Shipping: Next business day after production completes
  const deliveryDate = getNextBusinessDay(productionComplete, config.blackoutDates || []);
  
  return deliveryDate;
}

 */
export function formatDeliveryDate(date: Date, userTimezone?: string): string {
  const tz = userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return date.toLocaleDateString('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Get user's timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
