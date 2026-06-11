-- MixHive Publish Workflow Example
-- Demonstrates generating a pattern and publishing to MixHive

-- Load mixhive library
local mh = require("mixhive")

-- Configure
local BPM = 140
local KEY = "D"
local GENRE = "techno"
local TRACK_NAME = "Lua Generated Track"

-- Set transport
music.set_bpm{bpm=BPM}

-- Generate a driving techno pattern
local scale = {0, 2, 4, 5, 7, 9, 11}
local root = 36  -- D1

-- Bassline (8 bars)
for i = 0, 31 do
    local beat = i * 1.0
    local pitch = root + scale[(i % 7) + 1]
    music.play_note{pitch=pitch, duration=0.25, velocity=110, time=beat}

    -- Offbeat accent
    if i % 2 == 0 then
        music.play_note{pitch=pitch + 12, duration=0.125, velocity=90, time=beat + 0.5}
    end
end

-- Hi-hat pattern (16th notes)
for i = 0, 127 do
    local beat = i * 0.25
    music.play_note{pitch=42, duration=0.05, velocity=math.random(60, 100), time=beat}
end

-- Kick pattern (4-on-the-floor)
for i = 0, 31 do
    local beat = i * 1.0
    music.play_note{pitch=36, duration=0.2, velocity=120, time=beat}
end

-- Clap on 2 and 4
for i = 0, 15 do
    local beat = i * 2.0 + 1.0
    music.play_note{pitch=39, duration=0.1, velocity=100, time=beat}
end

-- Publish to MixHive
print("Publishing '" .. TRACK_NAME .. "' to MixHive...")
return {
    type = "mixhive_publish",
    title = TRACK_NAME,
    bpm = BPM,
    key = KEY,
    genre = GENRE,
    is_public = true
}
