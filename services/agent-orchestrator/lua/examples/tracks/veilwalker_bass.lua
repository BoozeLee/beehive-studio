-- Veilwalker's Offbeat Odyssey — Off-Beat Psytrance Bassline
-- Ace Ventura inspired: rolling 16th-note patterns, syncopated/off-beat emphasis,
-- subtle pitch slides, strong low-end weight
-- BPM: 138 | Key: E minor | Root: E1 (40), Fifth: B1 (47)

local agent = {}

-- MIDI constants
local E1 = 40
local Fs1 = 42
local G1 = 43
local A1 = 45
local B1 = 47
local D2 = 50
local E2 = 52

-- Classical psytrance off-beat patterns (16 steps)
-- The "off-beat" feel: bass plays on each 8th note,
-- interlocking with the kick on downbeats
local PATTERNS = {
    -- Root on all 8th notes — driving, hypnotic
    root_eighth = {E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1},
    -- Root-Fifth alternating — harmonic movement
    root_fifth = {E1, B1, E1, B1, E1, B1, E1, B1, E1, B1, E1, B1, E1, B1, E1, B1},
    -- Root-Fifth-Root-Root — classic Ace Ventura variation
    ace_var =  {E1, B1, E1, E1, E1, B1, E1, E1, E1, B1, E1, E1, E1, B1, E1, E1},
    -- Descending pattern for tension
    descend =  {E1, D2, B1, G1, E1, D2, B1, G1, E1, D2, B1, G1, E1, D2, B1, G1},
    -- Ascending for build-ups
    ascend =   {E1, G1, B1, D2, E1, G1, B1, D2, E1, G1, B1, D2, E1, G1, B1, D2},
    -- Minimal root pulse for breakdowns
    pulse =    {E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1, E1},
}

-- Map section names to pattern choices
local SECTION_PATTERNS = {
    intro = "pulse",
    build = "ace_var",
    peak = "root_fifth",
    breakdown = "pulse",
    drop = "root_fifth",
    outro = "root_eighth",
}

-- Generate bass events for a set of bars
-- Each bar gets a pattern assigned based on overall section mapping
function agent.generate(total_bars, section_map)
    section_map = section_map or {}
    local events = {}
    for bar = 0, total_bars - 1 do
        -- Determine which section this bar belongs to
        local section = "peak"
        for s_name, s_range in pairs(section_map) do
            if bar >= s_range[1] and bar < s_range[2] then
                section = s_name
                break
            end
        end
        local pattern_name = SECTION_PATTERNS[section] or "root_eighth"
        local pattern = PATTERNS[pattern_name] or PATTERNS.root_eighth
        for step = 1, 16 do
            local pitch = pattern[step]
            local t = bar * 4 + (step - 1) * 0.25
            -- Velocity: accent first 16th of each beat, softer on the rest
            local vel
            if step % 4 == 1 then
                vel = 110
            elseif step % 4 == 2 then
                vel = 95
            elseif step % 4 == 3 then
                vel = 90
            else
                vel = 85
            end
            -- Slight velocity humanization
            vel = vel + music.random(-3, 3)
            -- Duration: short for punchy off-beat feel
            local dur = 0.18 + music.random(-0.02, 0.02)
            table.insert(events, {
                pitch = pitch,
                time = t,
                velocity = math.floor(vel),
                duration = dur,
            })
        end
    end
    return events
end

-- Play the bassline
function agent.play(bars, section_map)
    local events = agent.generate(bars, section_map)
    for _, e in ipairs(events) do
        music.play_note{
            pitch = e.pitch,
            time = e.time,
            velocity = e.velocity,
            duration = e.duration
        }
    end
    return {type = "agent_complete", agent = "veilwalker_bass", bars = bars}
end

-- Auto-execute with default: play 8 bars
return agent.play(8, {intro = {0, 2}, build = {2, 8}})
