import type { StepStatus, Priority } from '@/types'
import clsx from 'clsx'

export function StatusBadge({ status }: { status: StepStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        status === 'COMPLETED' && 'bg-green-100 text-green-800',
        status === 'IN_PROGRESS' && 'bg-blue-100 text-blue-800',
        status === 'DELAYED' && 'bg-red-100 text-red-800',
        status === 'NOT_STARTED' && 'bg-gray-100 text-gray-600'
      )}
    >
      {status.replace('_', ' ')}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold',
        priority === 'VIP' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
      )}
    >
      {priority}
    </span>
  )
}

export function KPICard({
  title,
  value,
  subtitle,
  color = 'primary',
}: {
  title: string
  value: string | number
  subtitle?: string
  color?: 'primary' | 'green' | 'yellow' | 'red' | 'gray'
}) {
  const colors = {
    primary: 'border-l-primary-500 bg-primary-50/50',
    green: 'border-l-green-500 bg-green-50/50',
    yellow: 'border-l-yellow-500 bg-yellow-50/50',
    red: 'border-l-red-500 bg-red-50/50',
    gray: 'border-l-gray-400 bg-gray-50/50',
  }

  return (
    <div className={clsx('rounded-lg border border-gray-200 border-l-4 p-4', colors[color])}>
      <p className="text-sm text-gray-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  )
}

export function PatientStatusDot({ status }: { status: 'on-track' | 'waiting' | 'delayed' }) {
  return (
    <span
      className={clsx(
        'inline-block w-2.5 h-2.5 rounded-full',
        status === 'on-track' && 'bg-status-green',
        status === 'waiting' && 'bg-status-yellow',
        status === 'delayed' && 'bg-status-red'
      )}
    />
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <p className="text-sm">{message}</p>
    </div>
  )
}
