-- MixHive Search & Remix Example
-- Searches MixHive for tracks, then generates a remix

-- Search for tracks
local search_result = {
    type = "mixhive_search",
    query = "techno",
    limit = 10
}

-- Get a reference track's metadata
local reference = {
    type = "mixhive_get_track",
    track_id = "latest"
}

-- Generate a remix based on the reference
music.set_bpm{bpm=135}

-- Create a new interpretation
local chords = {0, 4, 7, 11}  -- Major 7th
local root = 48  -- C3

for i = 0, 15 do
    local beat = i * 2.0
    for _, interval in ipairs(chords) do
        music.play_note{
            pitch = root + interval,
            duration = 1.5,
            velocity = 80,
            time = beat
        }
    end
end

return {
    type = "mixhive_remix",
    original_query = "techno",
    generated_bars = 8
}
