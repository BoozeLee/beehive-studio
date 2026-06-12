-- MixHive Lua client library
-- Provides high-level helpers for interacting with MixHive from Lua scripts

local mixhive = {}

-- Publish current project to MixHive
-- eg: mixhive.publish_project("My Track", "techno", tags={"dark", "experimental"})
function mixhive.publish_project(title, genre, opts)
    opts = opts or {}
    return music.play_note{
        pitch = 60, duration = 1, time = 0,
        _meta = {
            mixhive = true,
            action = "publish",
            title = title,
            genre = genre,
            description = opts.description or "",
            tags = opts.tags or {},
            is_public = opts.is_public
        }
    }
end

-- Search MixHive for tracks matching a query
-- eg: mixhive.search("techno", limit=5)
function mixhive.search(query, opts)
    opts = opts or {}
    local limit = opts.limit or 20
    local genre = opts.genre or ""
    return {
        type = "mixhive_search",
        query = query,
        limit = limit,
        genre = genre
    }
end

-- Get a random track from MixHive
function mixhive.random_track()
    return {
        type = "mixhive_random_track"
    }
end

-- Get artist's published tracks
-- eg: mixhive.artist_tracks("dj-nef")
function mixhive.artist_tracks(handle)
    return {
        type = "mixhive_artist_tracks",
        artist_handle = handle
    }
end

-- Generate and publish a track with one call
-- eg: mixhive.generate_and_publish("techno", "My Track", bpm=140)
function mixhive.generate_and_publish(genre, title, opts)
    opts = opts or {}
    local bpm = opts.bpm or 128
    local key = opts.key or "C"
    local bars = opts.bars or 8

    -- Generate music using the agent API
    music.set_bpm{bpm=bpm}

    -- Generate a bassline in the key
    local scale_notes = {0, 2, 4, 5, 7, 9, 11}
    local root_note = key == "C" and 36 or 36 + music.random_int(12)
    for i = 0, bars * 4 - 1 do
        local beat = i * 1.0
        local pitch = root_note + scale_notes[(i % #scale_notes) + 1]
        music.play_note{pitch=pitch, duration=0.25, time=beat}
        if i % 2 == 0 then
            music.play_note{pitch=pitch + 12, duration=0.125, time=beat + 0.5}
        end
    end

    return {
        type = "mixhive_generate_and_publish",
        title = title,
        genre = genre,
        bpm = bpm,
        key = key,
        bars = bars
    }
end

return mixhive
