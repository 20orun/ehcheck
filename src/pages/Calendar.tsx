import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '@/store/AppContext'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import clsx from 'clsx'

export default function CalendarPage() {
  const { selectedDate, setSelectedDate, clinicDates, holidays, toggleHoliday, isHoliday } = useApp()
  const navigate = useNavigate()

  // Parse selectedDate to get initial month view
  const [viewYear, setViewYear] = useState(() => parseInt(selectedDate.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => parseInt(selectedDate.slice(5, 7)) - 1) // 0-indexed

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const datesWithData = new Set(clinicDates)

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay() // 0=Sun

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' })

  const selectDay = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDate(dateStr)
    navigate('/')
  }

  const handleToggleHoliday = (e: React.MouseEvent, day: number) => {
    e.stopPropagation()
    e.preventDefault()
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    // Sundays are always holidays, don't toggle
    const d = new Date(dateStr + 'T00:00:00')
    if (d.getDay() === 0) return
    toggleHoliday(dateStr)
  }

  const goToToday = () => {
    setSelectedDate(todayStr)
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    navigate('/')
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <CalendarDays className="w-6 h-6 text-primary-600" />
        <h2 className="text-xl font-bold text-gray-900">Day History</h2>
      </div>

      {/* Info banner */}
      {selectedDate !== todayStr && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          <span>
            Viewing data from <strong>{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong>
          </span>
          <button onClick={goToToday} className="ml-auto text-xs font-medium text-amber-700 underline hover:text-amber-900">
            Go to Today
          </button>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <span className="text-lg font-semibold text-gray-900">{monthLabel}</span>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-400 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells for days before 1st */}
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="h-12" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const hasData = datesWithData.has(dateStr)
          const holiday = isHoliday(dateStr)
          const isSunday = new Date(dateStr + 'T00:00:00').getDay() === 0

          return (
            <button
              key={day}
              onClick={() => selectDay(day)}
              onContextMenu={(e) => handleToggleHoliday(e, day)}
              title={holiday ? (isSunday ? 'Sunday (Holiday)' : 'Holiday (right-click to remove)') : 'Right-click to mark as holiday'}
              className={clsx(
                'h-12 rounded-lg text-sm font-medium transition-all relative flex flex-col items-center justify-center',
                !isSelected && !isToday && !holiday && 'text-gray-700 hover:bg-gray-100',
                !isSelected && !isToday && holiday && 'text-red-400 bg-red-50 hover:bg-red-100',
                !isSelected && isToday && 'ring-2 ring-primary-400 text-primary-700 bg-primary-50 hover:bg-primary-100',
                isSelected && 'bg-primary-600 text-white shadow-md',
              )}
            >
              {day}
              {hasData && !isSelected && (
                <span className={clsx(
                  'absolute bottom-1 w-1.5 h-1.5 rounded-full',
                  isToday ? 'bg-primary-500' : 'bg-green-500'
                )} />
              )}
              {hasData && isSelected && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-white" />
              )}
              {holiday && !isSelected && (
                <span className="absolute top-0.5 right-0.5 text-[8px] text-red-400">H</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Has patient data
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary-500" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-primary-600" /> Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-50 border border-red-200 text-[7px] text-red-400 flex items-center justify-center">H</span> Holiday
        </span>
      </div>

      <p className="mt-2 text-[10px] text-gray-400">Right-click a date to toggle holiday. Sundays are always holidays.</p>

      {/* Quick date list of recent dates with data */}
      {clinicDates.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent days with data</h3>
          <div className="space-y-1">
            {clinicDates.slice(0, 10).map((date) => {
              const d = new Date(date + 'T00:00:00')
              const label = d.toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
              const isCurrent = date === selectedDate
              return (
                <button
                  key={date}
                  onClick={() => { setSelectedDate(date); navigate('/') }}
                  className={clsx(
                    'w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors flex items-center justify-between',
                    isCurrent
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  )}
                >
                  <span>{label}</span>
                  {date === todayStr && (
                    <span className="text-xs bg-primary-100 text-primary-600 px-2 py-0.5 rounded-full font-medium">Today</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
