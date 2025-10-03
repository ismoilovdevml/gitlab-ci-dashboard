'use client'

import { useState, useEffect } from 'react'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  placeholder?: string
  fallback?: string
  onLoad?: () => void
  onError?: () => void
}

/**
 * Lazy loading image component with intersection observer
 * Loads images only when they enter the viewport
 */
export default function LazyImage({
  src,
  alt,
  className = '',
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200"%3E%3Crect fill="%23ddd" width="300" height="200"/%3E%3C/svg%3E',
  fallback,
  onLoad,
  onError
}: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState(placeholder)
  const [imageRef, setImageRef] = useState<HTMLImageElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let observer: IntersectionObserver

    if (imageRef && isLoading) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setImageSrc(src)
              observer.unobserve(imageRef)
            }
          })
        },
        {
          rootMargin: '50px' // Start loading 50px before entering viewport
        }
      )

      observer.observe(imageRef)
    }

    return () => {
      if (observer && imageRef) {
        observer.unobserve(imageRef)
      }
    }
  }, [imageRef, src, isLoading])

  const handleLoad = () => {
    setIsLoading(false)
    onLoad?.()
  }

  const handleError = () => {
    setIsLoading(false)
    if (fallback) {
      setImageSrc(fallback)
    }
    onError?.()
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={setImageRef}
      src={imageSrc}
      alt={alt}
      className={`${className} ${isLoading ? 'animate-pulse' : ''}`}
      onLoad={handleLoad}
      onError={handleError}
      loading="lazy"
    />
  )
}
