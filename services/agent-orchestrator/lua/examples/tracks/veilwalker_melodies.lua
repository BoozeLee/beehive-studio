-- Veilwalker's Offbeat Odyssey — Hypnotic Melodies & Leads
-- Evolving plucks, sustained leads, counter-melodies
-- E natural minor scale: E F# G A B C D
-- BPM: 138 | Key: E minor

local agent = {}

-- E natural minor scale (MIDI numbers, octave 4 = 64-base)
local SCALE = {64, 66, 67, 69, 71, 72, 74}
local SCALE_3 = {76, 78, 79, 81, 83, 84, 86}  -- octave 5
local SCALE_2 = {52, 54, 55, 57, 59, 60, 62}  -- octave 3

local function scale_note(scale, degree, octave_offset)
    degree = ((degree - 1) % #scale) + 1
    return scale[degree] + (octave_offset or 0) * 12
end

-- Primary hypnotic motif (E minor pentatonic flavor, 2 bars)
-- Pattern: ascending-descending with rhythmic interest
local function generate_motif(start_bar, length_bars, octave)
    octave = octave or 0
    local notes = {}
    -- 16-step motif over 2 bars, repeated
    local motif_sequence = {
        {deg = 1, dur = 0.5}, {deg = 3, dur = 0.25}, {deg = 5, dur = 0.5}, {deg = 3, dur = 0.25},
        {deg = 6, dur = 0.25}, {deg = 5, dur = 0.25}, {deg = 3, dur = 0.5}, {deg = 2, dur = 0.25},
        {deg = 1, dur = 0.5}, {deg = 2, dur = 0.25}, {deg = 3, dur = 0.25}, {deg = 5, dur = 0.5},
        {deg = 7, dur = 0.5}, {deg = 6, dur = 0.25}, {deg = 5, dur = 0.5}, {deg = 1, dur = 0.25},
    }
    for bar = 0, length_bars - 1 do
        local step = 0
        local idx = (bar % 2) * 8 + 1
        for _ = 1, 16 do
            local seq_idx = ((idx - 1) % #motif_sequence) + 1
            local entry = motif_sequence[seq_idx]
            local pitch = scale_note(SCALE, entry.deg, octave + (bar % 4 == 0 and 0 or -1))
            local t = start_bar * 4 + bar * 4 + step
            local vel = 100 + music.random(-5, 5)
            table.insert(notes, {pitch = pitch, time = t, velocity = math.floor(vel), duration = entry.dur})
            step = step + entry.dur
            idx = idx + 1
        end
    end
    return notes
end

-- Counter-melody (doubling the motif in thirds)
local function generate_counter_melody(start_bar, length_bars)
    local notes = {}
    for bar = 0, length_bars - 1 do
        for step = 0, 31 do
            if step % 4 == 0 then
                local degs = {1, 5, 3, 7}
                local deg = degs[(math.floor(step / 4) % 4) + 1]
                local pitch = scale_note(SCALE_3, deg + 2, 0)
                local t = start_bar * 4 + bar * 4 + step * 0.25
                local vel = 70 + music.random(-3, 3)
                table.insert(notes, {pitch = pitch, time = t, velocity = math.floor(vel), duration = 0.45})
            end
        end
    end
    return notes
end

-- Pad drone (sustained root and fifth)
function agent.generate_pad_drone(start_bar, length_bars)
    local events = {}
    for bar = 0, length_bars - 1 do
        local t = (start_bar + bar) * 4
        events[#events + 1] = {pitch = scale_note(SCALE_2, 1, 0), time = t, velocity = 60, duration = 4.0}
        events[#events + 1] = {pitch = scale_note(SCALE_2, 5, 0), time = t, velocity = 55, duration = 4.0}
    end
    return events
end

-- Arpeggiated embellishment (16th note patterns)
function agent.generate_arpeggio(start_bar, length_bars, octave)
    octave = octave or 1
    local events = {}
    for bar = 0, length_bars - 1 do
        local chord_tones = {1, 5, 3, 7}
        for step = 1, 16 do
            local deg = chord_tones[((step - 1) % 4) + 1]
            local pitch = scale_note(SCALE, deg, octave)
            local t = (start_bar + bar) * 4 + (step - 1) * 0.25
            local vel = 45 + music.random(-3, 3)
            table.insert(events, {pitch = pitch, time = t, velocity = math.floor(vel), duration = 0.22})
        end
    end
    return events
end

-- Riser / tension builder (ascending scale, overlapping)
function agent.generate_riser(start_bar, length_bars)
    local events = {}
    local total_steps = length_bars * 16
    for step = 0, total_steps - 1 do
        local progress = step / total_steps
        local deg = math.floor(progress * 7) + 1
        local pitch = scale_note(SCALE_3, math.min(deg, 7))
        local t = start_bar * 4 + step * 0.25
        local vel = math.floor(30 + progress * 70)
        local dur = 0.05 + progress * 0.15
        table.insert(events, {pitch = pitch, time = t, velocity = vel, duration = dur})
    end
    return events
end

-- Main: generate all melodic content
function agent.generate(total_bars, section_map)
    section_map = section_map or {}
    local all = {}
    local function in_section(bar, name)
        local s = section_map[name]
        return s and bar >= s[1] and bar < s[2]
    end
    for bar = 0, total_bars - 1 do
        if in_section(bar, "intro") then
            -- sparse melody hints in intro
            if bar % 4 == 0 then
                local degs = {1, 5, 3}
                local d = degs[(math.floor(bar / 4) % 3) + 1]
                local pitch = scale_note(SCALE, d, 1)
                table.insert(all, {pitch = pitch, time = bar * 4, velocity = 50, duration = 1.0})
            end
        elseif in_section(bar, "build") or in_section(bar, "peak") then
            local motif = generate_motif(total_bars, 1, 1)
            for _, n in ipairs(motif) do
                table.insert(all, n)
            end
        elseif in_section(bar, "breakdown") then
            -- pad drone during breakdown
            local drone = agent.generate_pad_drone(bar, 1)
            for _, n in ipairs(drone) do
                table.insert(all, n)
            end
        elseif in_section(bar, "drop") or in_section(bar, "outro") then
            local motif = generate_motif(total_bars, 1, 1)
            for _, n in ipairs(motif) do
                table.insert(all, n)
            end
        end
    end
    table.sort(all, function(a, b) return a.time < b.time end)
    return all
end

-- Play all melodic events
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
    return {type = "agent_complete", agent = "veilwalker_melodies", bars = total_bars}
end

-- Auto-execute with default: play 8 bars
return agent.play(8, {intro = {0, 2}, build = {2, 8}})
