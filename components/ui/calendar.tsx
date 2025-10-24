'use client'

import * as React from 'react'
import dayjs from 'dayjs'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { cn } from '@/lib/utils'

// Create a dark theme for the MUI calendar
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#3b82f6', // blue-500
    },
    background: {
      default: 'hsl(var(--background))',
      paper: 'hsl(var(--card))',
    },
    text: {
      primary: 'hsl(var(--foreground))',
      secondary: 'hsl(var(--muted-foreground))',
    },
  },
})

interface CalendarProps {
  readonly className?: string
  readonly selectedDate?: Date
  readonly onDateChange?: (date: Date | null) => void
}

function Calendar({ className, selectedDate, onDateChange }: CalendarProps) {
  const [value, setValue] = React.useState(dayjs(selectedDate || new Date()))
  const [isMounted, setIsMounted] = React.useState(false)

  // Ensure component only renders on client side to prevent hydration errors
  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // Add custom styling for weekend days
  React.useEffect(() => {
    if (isMounted) {
      const style = document.createElement('style')
      style.textContent = `
        /* Target Sunday dates (first column) */
        .MuiDayCalendar-weekContainer > .MuiPickersDay-root:nth-child(1):not(.Mui-selected) {
          color: #ef4444 !important;
          font-weight: 600 !important;
        }
        .MuiDayCalendar-weekContainer > .MuiPickersDay-root:nth-child(1):not(.Mui-selected) * {
          color: #ef4444 !important;
        }
        
        /* Target Saturday dates (last column) */
        .MuiDayCalendar-weekContainer > .MuiPickersDay-root:nth-child(7):not(.Mui-selected) {
          color: #a855f7 !important;
          font-weight: 600 !important;
        }
        .MuiDayCalendar-weekContainer > .MuiPickersDay-root:nth-child(7):not(.Mui-selected) * {
          color: #a855f7 !important;
        }
        
        /* Alternative approach using aria-label */
        .MuiPickersDay-root[aria-label*="Sunday"]:not(.Mui-selected) {
          color: #ef4444 !important;
          font-weight: 600 !important;
        }
        .MuiPickersDay-root[aria-label*="Saturday"]:not(.Mui-selected) {
          color: #a855f7 !important;
          font-weight: 600 !important;
        }
        .MuiPickersDay-root[aria-label*="Sunday"]:not(.Mui-selected) * {
          color: #ef4444 !important;
        }
        .MuiPickersDay-root[aria-label*="Saturday"]:not(.Mui-selected) * {
          color: #a855f7 !important;
        }
      `
      document.head.appendChild(style)
      
      // Function to apply weekend colors
      const applyWeekendColors = () => {
        const dayElements = document.querySelectorAll('.MuiPickersDay-root')
        
        for (const day of dayElements) {
          const dayElement = day as HTMLElement
          const ariaLabel = dayElement.getAttribute('aria-label') || ''
          
          if (ariaLabel.includes('Sunday') && !dayElement.classList.contains('Mui-selected')) {
            dayElement.style.color = '#ef4444'
            dayElement.style.fontWeight = '600'
            // Also apply to any child elements
            const children = dayElement.querySelectorAll('*')
            for (const child of children) {
              (child as HTMLElement).style.color = '#ef4444'
            }
          } else if (ariaLabel.includes('Saturday') && !dayElement.classList.contains('Mui-selected')) {
            dayElement.style.color = '#a855f7'
            dayElement.style.fontWeight = '600'
            // Also apply to any child elements
            const children = dayElement.querySelectorAll('*')
            for (const child of children) {
              (child as HTMLElement).style.color = '#a855f7'
            }
          }
        }
      }
      
      // Apply colors immediately
      setTimeout(applyWeekendColors, 100)
      
      // Set up observer to reapply colors when calendar changes
      const observer = new MutationObserver(() => {
        setTimeout(applyWeekendColors, 50)
      })
      
      const calendarContainer = document.querySelector('.MuiDateCalendar-root')
      if (calendarContainer) {
        observer.observe(calendarContainer, { childList: true, subtree: true })
      }
      
      return () => {
        style.remove()
        observer.disconnect()
      }
    }
  }, [isMounted])

  const handleDateChange = (newValue: dayjs.Dayjs | null) => {
    setValue(newValue || dayjs())
    if (onDateChange) {
      onDateChange(newValue ? newValue.toDate() : null)
    }
  }

  // Don't render on server to prevent hydration mismatch
  if (!isMounted) {
    return (
      <div className={cn('w-full flex items-center justify-center', className)} style={{ minHeight: '320px' }}>
        <div className="text-muted-foreground">Loading calendar...</div>
      </div>
    )
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <div className={cn('w-full', className)}>
          <DateCalendar
            value={value}
            onChange={handleDateChange}
            views={['year', 'month', 'day']}
            openTo="day"
            sx={{
              '& .MuiDateCalendar-root': {
                width: '100%',
                maxWidth: '320px',
                backgroundColor: 'transparent',
                color: 'hsl(var(--foreground))',
                borderRadius: '8px',
              },
              '& .MuiPickersCalendarHeader-root': {
                paddingLeft: '20px',
                paddingRight: '20px',
                paddingTop: '16px',
                paddingBottom: '16px',
                justifyContent: 'space-between',
              },
              '& .MuiPickersCalendarHeader-label': {
                fontSize: '18px',
                fontWeight: 700,
                color: 'hsl(var(--foreground))',
                cursor: 'pointer',
                padding: '8px 12px',
                borderRadius: '6px',
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: 'hsl(var(--accent))',
                },
              },
              '& .MuiPickersArrowSwitcher-root .MuiIconButton-root': {
                color: 'hsl(var(--foreground))',
                width: '32px',
                height: '32px',
                borderRadius: '6px',
                '&:hover': {
                  backgroundColor: 'hsl(var(--accent))',
                },
              },
              '& .MuiDayCalendar-weekContainer': {
                marginTop: '8px',
              },
              '& .MuiPickersDay-root': {
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                fontWeight: 500,
                width: '36px',
                height: '36px',
                borderRadius: '6px',
                margin: '2px',
                '&:hover': {
                  backgroundColor: 'hsl(var(--accent))',
                  color: 'hsl(var(--accent-foreground))',
                },
                '&.Mui-selected': {
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: '#2563eb',
                  },
                },
                '&.MuiPickersDay-today': {
                  backgroundColor: '#a9c3ed',
                  color: 'white',
                  fontWeight: 'bold',
                  '&:hover': {
                    backgroundColor: '#a9c3ed',
                    color: 'black',
                  },
                },
              },
              '& .MuiDayCalendar-weekDayLabel': {
                color: 'hsl(var(--muted-foreground))',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                '&:first-of-type': {
                  color: '#ef4444',
                },
                '&:last-of-type': {
                  color: '#a855f7',
                },
              },
              '& .MuiPickersYear-yearButton': {
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                fontWeight: 500,
                padding: '12px 16px',
                borderRadius: '8px',
                margin: '4px',
                minWidth: '80px',
                '&:hover': {
                  backgroundColor: 'hsl(var(--accent))',
                  color: 'hsl(var(--accent-foreground))',
                },
                '&.Mui-selected': {
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: '#2563eb',
                  },
                },
              },
              '& .MuiPickersMonth-monthButton': {
                color: 'hsl(var(--foreground))',
                fontSize: '14px',
                fontWeight: 500,
                padding: '12px 16px',
                borderRadius: '8px',
                margin: '4px',
                minWidth: '80px',
                '&:hover': {
                  backgroundColor: 'hsl(var(--accent))',
                  color: 'hsl(var(--accent-foreground))',
                },
                '&.Mui-selected': {
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: '#2563eb',
                  },
                },
              },
            }}
          />
        </div>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export { Calendar }
