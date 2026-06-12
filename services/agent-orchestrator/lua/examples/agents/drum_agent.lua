-- Drum Programming Agent
-- Generates drum patterns based on genre and complexity

local agent = {}

local PATTERNS = {
    four_on_floor = {1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0},
    half_time = {1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0},
    broken_beat = {1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0},
    drum_n_bass = {1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1},
    shuffle = {1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0},
}

local HAT_PATTERNS = {
    eighth = {1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0},
    sixteenth = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1},
    open_close = {2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0, 2, 0, 1, 0},
}

local KICK_NOTE = 36
local SNARE_NOTE = 38
local CLAP_NOTE = 39
local HAT_CLOSED = 42
local HAT_OPEN = 46

function agent.generate_kicks(bars, pattern_name)
    local pattern = PATTERNS[pattern_name] or PATTERNS.four_on_floor
    local events = {}
    for bar = 0, bars - 1 do
        for step = 1, 16 do
            if pattern[step] == 1 then
                local beat = bar * 4 + (step - 1) * 0.25
                table.insert(events, {pitch = KICK_NOTE, time = beat, velocity = 120, duration = 0.2})
            end
        end
    end
    return events
end

function agent.generate_snares(bars, pattern_name)
    local pattern = PATTERNS[pattern_name] or PATTERNS.four_on_floor
    local events = {}
    for bar = 0, bars - 1 do
        for step = 1, 16 do
            if pattern[step] == 1 then
                local beat = bar * 4 + (step - 1) * 0.25 + 0.5
                table.insert(events, {pitch = SNARE_NOTE, time = beat, velocity = 100, duration = 0.15})
            end
        end
    end
    return events
end

function agent.generate_hats(bars, pattern_name)
    local pattern = HAT_PATTERNS[pattern_name] or HAT_PATTERNS.sixteenth
    local events = {}
    for bar = 0, bars - 1 do
        for step = 1, 16 do
            local val = pattern[step]
            if val == 1 then
                local beat = bar * 4 + (step - 1) * 0.25
                table.insert(events, {pitch = HAT_CLOSED, time = beat, velocity = 80, duration = 0.05})
            elseif val == 2 then
                local beat = bar * 4 + (step - 1) * 0.25
                table.insert(events, {pitch = HAT_OPEN, time = beat, velocity = 70, duration = 0.15})
            end
        end
    end
    return events
end

-- Main entry point for the agent
function agent.run(bars, genre)
    bars = bars or 8
    genre = genre or "techno"

    local kick_pattern, snare_pattern, hat_pattern

    if genre == "techno" then
        kick_pattern = "four_on_floor"
        snare_pattern = "half_time"
        hat_pattern = "sixteenth"
    elseif genre == "drum_and_bass" then
        kick_pattern = "drum_n_bass"
        snare_pattern = "drum_n_bass"
        hat_pattern = "sixteenth"
    elseif genre == "hiphop" then
        kick_pattern = "broken_beat"
        snare_pattern = "half_time"
        hat_pattern = "eighth"
    else
        kick_pattern = "four_on_floor"
        snare_pattern = "four_on_floor"
        hat_pattern = "eighth"
    end

    local kicks = agent.generate_kicks(bars, kick_pattern)
    local snares = agent.generate_snares(bars, snare_pattern)
    local hats = agent.generate_hats(bars, hat_pattern)

    for _, event in ipairs(kicks) do
        music.play_note{ pitch = event.pitch, duration = event.duration, velocity = event.velocity, time = event.time }
    end
    for _, event in ipairs(snares) do
        music.play_note{ pitch = event.pitch, duration = event.duration, velocity = event.velocity, time = event.time }
    end
    for _, event in ipairs(hats) do
        music.play_note{ pitch = event.pitch, duration = event.duration, velocity = event.velocity, time = event.time }
    end

    return { type = "agent_complete", agent = "drum", bars = bars, genre = genre }
end

return agent
