/**
 * SessionViewGrid — Very rough MVP clip launcher grid for Sprint 1
 *
 * Heavily inspired by Beehive's WorkspaceGrid but for musical clips instead of terminals.
 * This is a stub to allow early wiring of the end-to-end loop.
 */

interface Clip {
  id: string;
  name: string;
  midiData?: any;
  reasoning?: string[];
  playback?: { instrument: string; preset?: string };
}

interface Props {
  clips: Clip[];
  onPlayClip?: (clipId: string) => void;
  onAccept?: (clipId: string) => void;
  onReject?: (clipId: string) => void;
  onVariations?: (clipId: string) => void;
}

export function SessionViewGrid({ clips, onPlayClip, onAccept, onReject, onVariations }: Props) {
  if (clips.length === 0) {
    return (
      <div className="session-grid-empty">
        <p>No clips yet. Send a brief to the Rhythm & Groove agent.</p>
      </div>
    );
  }

  return (
    <div className="session-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {clips.map((clip) => (
        <div key={clip.id} className="clip-card" style={{ border: '1px solid #444', padding: 12, borderRadius: 6 }}>
          <div><strong>{clip.name}</strong></div>
          {clip.reasoning && clip.reasoning.length > 0 && (
            <div style={{ fontSize: 11, marginTop: 8, opacity: 0.75, lineHeight: 1.35 }}>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>Reasoning</div>
              {clip.reasoning.slice(0, 2).map((r, i) => (
                <div key={i} style={{ marginBottom: 2 }}>• {r}</div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => onPlayClip?.(clip.id)} style={{ fontSize: 12 }}>▶ Play</button>
            <button onClick={() => onAccept?.(clip.id)} style={{ fontSize: 12 }}>Accept</button>
            <button onClick={() => onReject?.(clip.id)} style={{ fontSize: 12 }}>Reject</button>
            {onVariations && (
              <button onClick={() => onVariations(clip.id)} style={{ fontSize: 12 }}>Variations</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
