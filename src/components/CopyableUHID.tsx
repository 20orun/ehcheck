import React, { useState } from 'react'

interface CopyableUHIDProps {
  uhid: string
  className?: string
}

export function CopyableUHID({ uhid, className = '' }: CopyableUHIDProps) {
  const [showCopied, setShowCopied] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(uhid)
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy UHID:', err)
    }
  }

  return (
    <div className="relative inline-block">
      <span
        onClick={handleClick}
        className={`cursor-pointer hover:bg-blue-50 hover:text-blue-600 px-1.5 py-0.5 rounded transition-colors ${className}`}
        title="Click to copy UHID"
      >
        {uhid}
      </span>
      {showCopied && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-50 animate-fadeIn">
          Copied!
        </div>
      )}
    </div>
  )
}
