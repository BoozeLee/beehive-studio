-- Example: Generate a simple techno bassline in Lua
-- Run via: POST /lua/run with this script

local events = {}
local bpm = 142
local beat_duration = 60 / bpm

-- play_note returns two events: (note_on, note_off)
-- We can capture them directly:
--   local on, off = music.play_note{pitch=60, ...}

-- 4-bar rolling bassline (C2 = 36, Eb = 39, F = 41, G = 43)
local pattern = {36, 36, 39, 36, 41, 41, 43, 39}
local accents = {110, 85, 100, 90, 115, 80, 105, 95}

for bar = 0, 3 do
    for i, pitch in ipairs(pattern) do
        local beat = bar * 4 + (i - 1) * 0.5
        local on, off = music.play_note{
            pitch = pitch,
            velocity = accents[i],
            duration = 0.22,
            time = beat * beat_duration,
            channel = 0
        }
        table.insert(events, on)
        table.insert(events, off)
    end
end

return {
    name = "Techno Rolling Bassline",
    bpm = bpm,
    bars = 4,
    events = events,
    event_count = #events
}
