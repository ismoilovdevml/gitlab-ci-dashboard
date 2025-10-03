'use client'

import { useState, useEffect } from 'react'
import { Activity } from 'lucide-react'
import { gitlabThrottler } from '@/lib/api-throttle'

export default function ApiRateLimitIndicator() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const currentStatus = gitlabThrottler.getStatus()

      // UNLIMITED mode: Show only when processing
      setIsVisible(currentStatus.processing)
    }, 500)

    return () => clearInterval(interval)
  }, [])

  if (!isVisible) return null

  return (
    <div className="fixed bottom-4 right-4 bg-green-100 dark:bg-green-900/20 border border-green-500 rounded-lg px-4 py-2 shadow-lg z-50">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-green-600 dark:text-green-400 animate-pulse" />
        <div className="text-sm">
          <p className="font-medium text-green-700 dark:text-green-300">
            UNLIMITED Mode
          </p>
          <p className="text-xs text-green-600 dark:text-green-400">
            Processing all requests in parallel...
          </p>
        </div>
      </div>
    </div>
  )
}
