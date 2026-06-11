-- Veilwalker's Offbeat Odyssey — Atmospheres & Organic Vocal Textures
-- Deep evolving pads with slow filter sweeps, shimmering textures,
-- processed vocal fragments, and granular-style FX layers
-- BPM: 138 | Key: E minor

local agent = {}

-- E natural minor scale (octave 4)
local SCALE_4 = {64, 66, 67, 69, 71, 72, 74}
local SCALE_3 = {52, 54, 55, 57, 59, 60, 62}
local SCALE_5 = {76, 78, 79, 81, 83, 84, 86}

local function scale_note(scale, deg)
    return scale[((deg - 1) % #scale) + 1]
end

-- Deep evolving pads — slow-moving chordal pads with long durations
function agent.generate_deep_pads(start_bar, length_bars, octave)
    octave = octave or 0
    local events = {}
    for bar = start_bar, start_bar + length_bars - 1 do
        -- Chord shift every 4 bars for harmonic movement
        local chord_type = math.floor(bar / 4) % 4
        local degs
        if chord_type == 0 then degs = {1, 3, 5}     -- Em
        elseif chord_type == 1 then degs = {4, 6, 1}  -- Am
        elseif chord_type == 2 then degs = {5, 7, 2}  -- Bdim
        else degs = {3, 5, 7} end                     -- G
        local base = octave >= 0 and SCALE_4 or SCALE_3
        for _, d in ipairs(degs) do
            local pitch = scale_note(base, d)
            local t = bar * 4
            local vel = 35 + music.random(-2, 2)
            table.insert(events, {
                pitch = pitch, time = t, velocity = math.floor(vel), duration = 3.9
            })
        end
    end
    return events
end

-- Shimmering high textures (noise-based, high register)
function agent.generate_shimmer(start_bar, length_bars)
    local events = {}
    for bar = start_bar, start_bar + length_bars - 1 do
        for step = 1, 8 do
            if step % 2 == 1 or bar % 2 == 0 then
                local deg = ((bar * 8 + step) % 7) + 1
                local pitch = scale_note(SCALE_5, deg)
                local t = bar * 4 + (step - 1) * 0.5 + music.random(-0.02, 0.02)
                local vel = 25 + music.random(-3, 8)
                local dur = 0.3 + music.random(-0.05, 0.15)
                table.insert(events, {
                    pitch = pitch, time = t, velocity = math.floor(vel), duration = dur
                })
            end
        end
    end
    return events
end

-- Processed vocal fragments (simulated via MIDI notes with specific CC control)
-- Uses long sustained notes with velocity shaping to emulate vocal-like dynamics
function agent.generate_vocal_textures(start_bar, length_bars)
    local events = {}
    local vocal_phrases = {
        {time_offset = 0, deg = 5, dur = 2.0, vel = 45},
        {time_offset = 4, deg = 3, dur = 1.5, vel = 35},
        {time_offset = 8, deg = 7, dur = 3.0, vel = 50},
        {time_offset = 14, deg = 1, dur = 2.0, vel = 40},
    }
    for bar = start_bar, start_bar + length_bars - 1 do
        -- Place vocal moments every 4 bars
        local phrase_idx = (bar % 16) + 1
        local phrase = vocal_phrases[(phrase_idx % #vocal_phrases) + 1]
        local pitch = scale_note(SCALE_4, phrase.deg)
        local t = bar * 4 + phrase.time_offset
        local vel = phrase.vel + music.random(-3, 5)
        table.insert(events, {
            pitch = pitch, time = t, velocity = math.floor(vel), duration = phrase.dur
        })
        -- Echo/repeat of the vocal (softer, delayed)
        table.insert(events, {
            pitch = pitch, time = t + 1.5, velocity = math.floor(vel * 0.4), duration = 1.0
        })
    end
    return events
end

-- Filter sweep / riser effect (ascending notes, increasingly dense)
function agent.generate_sweep(start_bar, length_bars)
    local events = {}
    for bar = start_bar, start_bar + length_bars - 1 do
        local local_bar = bar - start_bar
        local progress = local_bar / length_bars
        for step = 1, 8 do
            local deg = math.floor(progress * 6) + 1 + step % 3
            local pitch = scale_note(SCALE_4, math.min(deg, 7))
            local t = bar * 4 + (step - 1) * 0.5
            local vel = math.floor(20 + progress * 50)
            local dur = 0.1 + progress * 0.3
            table.insert(events, {
                pitch = pitch, time = t, velocity = vel, duration = dur
            })
        end
    end
    return events
end

-- Sub-bass drone (low root note, very long)
function agent.generate_sub_drone(start_bar, length_bars)
    local events = {}
    for bar = start_bar, start_bar + length_bars - 1 do
        if bar % 2 == 0 then
            local pitch = scale_note(SCALE_3, 1) - 12  -- E0
            table.insert(events, {
                pitch = pitch, time = bar * 4, velocity = 25, duration = 7.8
            })
        end
    end
    return events
end

-- Main: generate all atmospheric content
function agent.generate(total_bars, section_map)
    section_map = section_map or {}
    local all = {}
    local function in_section(bar, name)
        local s = section_map[name]
        return s and bar >= s[1] and bar < s[2]
    end
    for bar = 0, total_bars - 1 do
        if in_section(bar, "intro") then
            local pads = agent.generate_deep_pads(bar, 1, 0)
            for _, n in ipairs(pads) do all[#all + 1] = n end
            if bar % 4 == 0 then
                local vocal = agent.generate_vocal_textures(bar, 1)
                for _, n in ipairs(vocal) do all[#all + 1] = n end
            end
        elseif in_section(bar, "build") or in_section(bar, "peak") then
            if bar % 4 == 0 then
                local pads = agent.generate_deep_pads(bar, 1, 0)
                for _, n in ipairs(pads) do all[#all + 1] = n end
            end
            local shimmer = agent.generate_shimmer(bar, 1)
            for _, n in ipairs(shimmer) do all[#all + 1] = n end
        elseif in_section(bar, "breakdown") then
            local pads = agent.generate_deep_pads(bar, 1, 0)
            for _, n in ipairs(pads) do all[#all + 1] = n end
            local vocal = agent.generate_vocal_textures(bar, 1)
            for _, n in ipairs(vocal) do all[#all + 1] = n end
            local shimmer = agent.generate_shimmer(bar, 1)
            for _, n in ipairs(shimmer) do all[#all + 1] = n end
            if bar % 8 == 0 then
                local sweep = agent.generate_sweep(bar, 2)
                for _, n in ipairs(sweep) do all[#all + 1] = n end
            end
        elseif in_section(bar, "drop") then
            local pads = agent.generate_deep_pads(bar, 1, 0)
            for _, n in ipairs(pads) do all[#all + 1] = n end
            local shimmer = agent.generate_shimmer(bar, 1)
            for _, n in ipairs(shimmer) do all[#all + 1] = n end
            local vocal = agent.generate_vocal_textures(bar, 1)
            for _, n in ipairs(vocal) do all[#all + 1] = n end
        elseif in_section(bar, "outro") then
            if bar % 4 == 0 then
                local pads = agent.generate_deep_pads(bar, 1, -1)
                for _, n in ipairs(pads) do all[#all + 1] = n end
            end
        end
    end
    table.sort(all, function(a, b) return a.time < b.time end)
    return all
end

-- Play all atmosphere events
function agent.play(total_bars, section_map)
    local events = agent.generate(total_bars, section_map)
    for _, e in ipairs(events) do
        music.play_note{
            pitch = e.pitch,
            time = e.time,
            velocity = e.velocity,
            duration = e.duration
        }
    end
    return {type = "agent_complete", agent = "veilwalker_atmospheres", bars = total_bars}
end

-- Auto-execute with default: play 8 bars
return agent.play(8, {intro = {0, 4}, build = {4, 8}})
