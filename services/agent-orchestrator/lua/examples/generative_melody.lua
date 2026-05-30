-- Example: Random generative melody
-- Uses the safe music.random() and music.random_int() APIs

local events = {}
local bpm = 128
local scale = {60, 62, 64, 67, 69, 72, 74}  -- C major pentatonic-ish
local beat_dur = 60 / bpm

for bar = 0, 3 do
    for step = 0, 15 do
        if music.random() > 0.45 then
            local pitch = scale[music.random_int(1, #scale)]
            local vel = music.random_int(70, 110)
            local dur = music.random(0.1, 0.4) * beat_dur
            local t = (bar * 4 + step * 0.25) * beat_dur
            local on, off = music.play_note{
                pitch = pitch,
                velocity = vel,
                duration = dur,
                time = t,
                channel = 1
            }
            table.insert(events, on)
            table.insert(events, off)
        end
    end
end

return {
    name = "Generative Melody",
    bpm = bpm,
    bars = 4,
    events = events,
    event_count = #events
}
