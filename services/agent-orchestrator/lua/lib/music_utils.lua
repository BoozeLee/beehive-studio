-- Music utility functions for Lua scripts

local music_utils = {}

-- Note name to MIDI number mapping
local NOTE_TO_MIDI = {
    c = 0, cs = 1, db = 1, d = 2, ds = 3, eb = 3,
    e = 4, f = 5, fs = 6, gb = 6, g = 7, gs = 8,
    ab = 8, a = 9, as = 10, bb = 10, b = 11
}

-- Scale intervals (semitones from root)
local SCALES = {
    major = {0, 2, 4, 5, 7, 9, 11},
    minor = {0, 2, 3, 5, 7, 8, 10},
    harmonic_minor = {0, 2, 3, 5, 7, 8, 11},
    melodic_minor = {0, 2, 3, 5, 7, 9, 11},
    pentatonic_major = {0, 2, 4, 7, 9},
    pentatonic_minor = {0, 3, 5, 7, 10},
    blues = {0, 3, 5, 6, 7, 10},
    chromatic = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11},
    whole_tone = {0, 2, 4, 6, 8, 10},
    diminished = {0, 2, 3, 5, 6, 8, 9, 11},
}

-- Chord types (semitones from root)
local CHORDS = {
    major = {0, 4, 7},
    minor = {0, 3, 7},
    diminished = {0, 3, 6},
    augmented = {0, 4, 8},
    sus2 = {0, 2, 7},
    sus4 = {0, 5, 7},
    major7 = {0, 4, 7, 11},
    minor7 = {0, 3, 7, 10},
    dominant7 = {0, 4, 7, 10},
    dim7 = {0, 3, 6, 9},
    m7b5 = {0, 3, 6, 10},
    maj9 = {0, 4, 7, 11, 14},
    min9 = {0, 3, 7, 10, 14},
    add9 = {0, 4, 7, 14},
}

-- Convert note name to MIDI number
-- eg: note_to_midi("C4") -> 60, note_to_midi("Eb5") -> 75
function music_utils.note_to_midi(name)
    local note_str = name:lower():match("^([a-g][sbf]?)")
    if not note_str then return nil end
    local octave_str = name:match("(-?%d+)$")
    local note = NOTE_TO_MIDI[note_str]
    if not note then return nil end
    local octave = tonumber(octave_str) or 4
    return (octave + 1) * 12 + note
end

-- Get scale notes (MIDI numbers) starting from a root note
-- eg: scale_notes(60, "major") -> {60, 62, 64, 65, 67, 69, 71}
function music_utils.scale_notes(root, scale_name)
    local intervals = SCALES[scale_name]
    if not intervals then
        intervals = SCALES.major
    end
    local notes = {}
    for _, interval in ipairs(intervals) do
        table.insert(notes, root + interval)
    end
    return notes
end

-- Get chord notes (MIDI numbers) starting from a root note
-- eg: chord_notes(60, "minor") -> {60, 63, 67}
function music_utils.chord_notes(root, chord_type, inversions)
    local intervals = CHORDS[chord_type]
    if not intervals then
        intervals = CHORDS.major
    end
    inversions = inversions or 0
    local notes = {}
    for _, interval in ipairs(intervals) do
        table.insert(notes, root + interval)
    end
    -- Apply inversions by moving bottom notes up an octave
    for i = 1, inversions do
        local moved = table.remove(notes, 1)
        table.insert(notes, moved + 12)
    end
    return notes
end

-- Generate a rhythm pattern
-- eg: rhythm_pattern(4, 16) -> {0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5} (8th notes)
function music_utils.rhythm_pattern(beats, divisions)
    local pattern = {}
    local step = 1 / divisions
    for i = 0, (beats * divisions) - 1 do
        local beat_pos = i * step
        table.insert(pattern, beat_pos * 4) -- in quarter-note units
    end
    return pattern
end

-- Humanize timing with random offset
function music_utils.humanize(amount)
    return music.random(-amount, amount)
end

-- Apply swing to a time value
function music_utils.swing(time, amount)
    local beat = math.floor(time)
    local fraction = time - beat
    local is_offbeat = fraction >= 0.5
    if is_offbeat then
        local offbeat_pos = fraction - 0.5
        local swing_offset = offbeat_pos * amount * 2
        return beat + 0.5 + offbeat_pos + swing_offset
    end
    return time
end

-- Map a value from one range to another
function music_utils.map(value, in_min, in_max, out_min, out_max)
    return out_min + (value - in_min) * (out_max - out_min) / (in_max - in_min)
end

-- Clamp a value between min/max
function music_utils.clamp(value, min, max)
    return math.max(min, math.min(max, value))
end

-- Linear interpolation
function music_utils.lerp(a, b, t)
    return a + (b - a) * t
end

return music_utils
