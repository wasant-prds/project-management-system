import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date to yyyy-mm-dd format
 * @param date - Date object, date string, or ISO string
 * @returns Formatted date string in yyyy-mm-dd format
 */
export function formatDate(date: Date | string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*\+07:00)?$/.test(date)) {
    return date.slice(0, 10)
  }
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
