import { useRef, useEffect, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.js'
import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.js'

/* ─────────────────────────────────────────────────────────────
   JetBee WaveformViewer
   wavesurfer.js v7 + Regions plugin
   ───────────────────────────────────────────────────────────── */

export interface WaveformRegion {
  id: string
  start: number
  end: number
  color?: string
  label?: string
}

export interface WaveformViewerProps {
  audioUrl?: string
  onRegionCreate?: (region: { start: number; end: number }) => void
  onRegionClick?: (region: { start: number; end: number }) => void
  regions?: WaveformRegion[]
  onPlayPause?: (playing: boolean) => void
  isPlaying?: boolean
}

const WAVE_COLOR = '#FF8C42'
const PROGRESS_COLOR = '#F5C542'
const CURSOR_COLOR = '#FF8C42'
const BG_COLOR = '#1A1410'

const TIMELINE_HEIGHT = 24
const DEFAULT_ZOOM = 50
const ZOOM_STEP = 1.5
const MIN_ZOOM = 5
const MAX_ZOOM = 2000

export function WaveformViewer({
  audioUrl,
  onRegionCreate,
  onRegionClick,
  regions = [],
  onPlayPause,
  isPlaying,
}: WaveformViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const waveformRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const regionsPluginRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const isSyncingRef = useRef(false)

  const [isReady, setIsReady] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM)
  const [playing, setPlaying] = useState(false)
  const [waveformHeight, setWaveformHeight] = useState(128)

  /* ── Initialise WaveSurfer (once) ── */
  useEffect(() => {
    if (!waveformRef.current) return

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: CURSOR_COLOR,
      cursorWidth: 2,
      height: waveformHeight,
      normalize: false,
      minPxPerSec: currentZoom,
      fillParent: true,
      interact: true,
    })

    wavesurferRef.current = ws

    // Time ruler at the top
    const timeline = TimelinePlugin.create({
      height: TIMELINE_HEIGHT,
      style: {
        fontSize: '11px',
        color: '#8A7E72',
        fontFamily: 'var(--jb-font-mono)',
      },
      primaryLabelInterval: 5,
      secondaryLabelInterval: 1,
      timeInterval: 0.5,
    })
    ws.registerPlugin(timeline)

    // Regions plugin
    const rp = RegionsPlugin.create()
    regionsPluginRef.current = rp
    ws.registerPlugin(rp)

    // Enable drag-to-create regions
    rp.enableDragSelection({
      color: 'rgba(255, 140, 66, 0.25)',
    } as Parameters<typeof rp.enableDragSelection>[0])

    // User finished dragging a new region
    rp.on('region-created', (region) => {
      if (isSyncingRef.current) return
      onRegionCreate?.({ start: region.start, end: region.end })
    })

    // Lifecycle events
    ws.on('ready', () => {
      setIsReady(true)
      setDuration(ws.getDuration())
    })

    ws.on('play', () => {
      setPlaying(true)
      onPlayPause?.(true)
    })
    ws.on('pause', () => {
      setPlaying(false)
      onPlayPause?.(false)
    })
    ws.on('finish', () => {
      setPlaying(false)
      onPlayPause?.(false)
    })

    return () => {
      ws.destroy()
      wavesurferRef.current = null
      regionsPluginRef.current = null
      setIsReady(false)
      setDuration(0)
      setPlaying(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── Resize observer → fill container height ── */
  useEffect(() => {
    const el = waveformRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.max(entry.contentRect.height - TIMELINE_HEIGHT, 64)
        setWaveformHeight(h)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /* ── Push height changes into WaveSurfer ── */
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    ws.setOptions({ height: waveformHeight })
  }, [waveformHeight])

  /* ── Load / change audio ── */
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws) return
    if (audioUrl) {
      ws.load(audioUrl)
      setIsReady(false)
    }
  }, [audioUrl])

  /* ── Sync external isPlaying prop ── */
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !isReady || isPlaying === undefined) return
    if (isPlaying && !ws.isPlaying()) {
      ws.play()
    } else if (!isPlaying && ws.isPlaying()) {
      ws.pause()
    }
  }, [isPlaying, isReady])

  /* ── Sync zoom ── */
  useEffect(() => {
    const ws = wavesurferRef.current
    if (!ws || !isReady) return
    ws.zoom(currentZoom)
  }, [currentZoom, isReady])

  /* ── Sync prop-controlled regions ── */
  useEffect(() => {
    const rp = regionsPluginRef.current
    const ws = wavesurferRef.current
    if (!rp || !ws || !isReady) return

    isSyncingRef.current = true

    // Remove existing regions
    const existing = Object.values((rp as any).regions as Record<string, { remove: () => void }>)
    existing.forEach((r) => r.remove())

    // Add prop regions
    regions.forEach((r) => {
      const region = rp.addRegion({
        id: r.id,
        start: r.start,
        end: r.end,
        color: r.color || 'rgba(255, 140, 66, 0.3)',
        content: r.label,
      })
      region.on('click', () => {
        onRegionClick?.({ start: region.start, end: region.end })
      })
    })

    isSyncingRef.current = false
  }, [regions, isReady, onRegionClick])

  /* ── Toolbar handlers ── */
  const handlePlayPause = useCallback(() => {
    const ws = wavesurferRef.current
    if (!ws || !isReady) return
    ws.playPause()
  }, [isReady])

  const handleZoomIn = useCallback(() => {
    setCurrentZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM))
  }, [])

  const handleZoomOut = useCallback(() => {
    setCurrentZoom((z) => Math.max(z / ZOOM_STEP, MIN_ZOOM))
  }, [])

  const handleFitToWidth = useCallback(() => {
    const container = containerRef.current
    const ws = wavesurferRef.current
    if (!container || !ws || !isReady || duration <= 0) return
    const width = container.clientWidth
    const newZoom = width / duration
    setCurrentZoom(Math.max(newZoom, MIN_ZOOM))
  }, [isReady, duration])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: BG_COLOR,
        overflow: 'hidden',
      }}
    >
      {/* Mini toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          background: 'var(--jb-toolbar-bg, #18120E)',
          borderBottom: '1px solid var(--jb-border, #2A1F18)',
          flexShrink: 0,
        }}
      >
        <button
          className="jetbee-toolbtn"
          onClick={handlePlayPause}
          disabled={!isReady}
          title={playing ? 'Pause' : 'Play'}
          type="button"
        >
          <span aria-hidden="true">{playing ? '⏸' : '▶'}</span>
          <span style={{ marginLeft: 4 }}>{playing ? 'Pause' : 'Play'}</span>
        </button>

        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--jb-border, #2A1F18)',
            margin: '0 4px',
          }}
        />

        <button
          className="jetbee-toolbtn"
          onClick={handleZoomIn}
          disabled={!isReady}
          title="Zoom in"
          type="button"
        >
          <span aria-hidden="true">🔍+</span>
        </button>
        <button
          className="jetbee-toolbtn"
          onClick={handleZoomOut}
          disabled={!isReady}
          title="Zoom out"
          type="button"
        >
          <span aria-hidden="true">🔍−</span>
        </button>
        <button
          className="jetbee-toolbtn"
          onClick={handleFitToWidth}
          disabled={!isReady}
          title="Fit to width"
          type="button"
        >
          <span aria-hidden="true">⤢</span>
          <span style={{ marginLeft: 4 }}>Fit</span>
        </button>

        <div
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--jb-text-muted, #8A7E72)',
            fontFamily: 'var(--jb-font-mono)',
          }}
        >
          {isReady
            ? `${currentZoom.toFixed(1)} px/s · ${duration.toFixed(2)}s`
            : audioUrl
              ? 'Loading…'
              : 'No audio loaded'}
        </div>
      </div>

      {/* Waveform canvas */}
      <div
        ref={waveformRef}
        style={{
          flex: 1,
          position: 'relative',
          minHeight: 0,
        }}
      />
    </div>
  )
}
