'use client'

import { useState, useEffect } from 'react'
import { Activity, AlertTriangle } from 'lucide-react'
import { gitlabThrottler } from '@/lib/api-throttle'

export default function ApiRateLimitIndicator() {
  const [status, setStatus] = useState({ queueLength: 0, processing: false })
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      const currentStatus = gitlabThrottler.getStatus()
      setStatus({
        queueLength: currentStatus.queueLength,
        processing: currentStatus.processing
      })

      // Show indicator if queue has items or processing
      setIsVisible(currentStatus.queueLength > 0 || currentStatus.processing)
    }, 500)

    return () => clearInterval(interval)
  }, [])

  if (!isVisible) return null

  const isWarning = status.queueLength > 10

  return (
    <div className={`fixed bottom-4 right-4 ${
      isWarning ? 'bg-yellow-100 dark:bg-yellow-900/20' : 'bg-blue-100 dark:bg-blue-900/20'
    } border ${
      isWarning ? 'border-yellow-500' : 'border-blue-500'
    } rounded-lg px-4 py-2 shadow-lg z-50`}>
      <div className="flex items-center gap-2">
        {isWarning ? (
          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
        ) : (
          <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-pulse" />
        )}
        <div className="text-sm">
          <p className={`font-medium ${
            isWarning ? 'text-yellow-700 dark:text-yellow-300' : 'text-blue-700 dark:text-blue-300'
          }`}>
            API Requests
          </p>
          <p className={`text-xs ${
            isWarning ? 'text-yellow-600 dark:text-yellow-400' : 'text-blue-600 dark:text-blue-400'
          }`}>
            {status.processing && 'Processing... '}
            {status.queueLength > 0 && `Queue: ${status.queueLength}`}
            {isWarning && ' (High load)'}
          </p>
        </div>
      </div>
    </div>
  )
}
