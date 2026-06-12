-- Veilwalker's Offbeat Odyssey — Psytrance Drums & Percussion
-- Generates four-on-the-floor kick, 16th hi-hats, off-beat open hats,
-- snare/clap on 2&4, shaker on 16ths, toms for fills, and rides for transitions
-- BPM: 138 | Key: E minor | Format: 16 steps per bar

local agent = {}

-- MIDI note constants
local KICK = 36
local SNARE = 38
local CLAP = 39
local HAT_CLOSED = 42
local HAT_OPEN = 46
local RIDE = 51
local CRASH = 49
local SHAKER = 70
local TOM_HI = 50
local TOM_MID = 47
local TOM_LO = 45
local PERC_LOW = 60

local function step_time(bar, step)
    return bar * 4 + (step - 1) * 0.25
end

-- Four-on-the-floor kick with velocity accent on 1
function agent.generate_kicks(total_bars, intro_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        local section_energy = 0.7
        if bar >= total_bars * 0.15 and bar < total_bars * 0.45 then
            section_energy = 0.85
        elseif bar >= total_bars * 0.45 and bar < total_bars * 0.6 then
            section_energy = 0.5
        elseif bar >= total_bars * 0.6 then
            section_energy = 1.0
        end
        for step = 1, 16, 4 do
            local vel
            if intro_bars and bar < intro_bars then
                vel = 80
            elseif step == 1 then
                vel = math.floor(127 * section_energy)
            else
                vel = math.floor(115 * section_energy)
            end
            local t = step_time(bar, step)
            table.insert(events, {pitch = KICK, time = t, velocity = vel, duration = 0.35})
        end
    end
    return events
end

-- Snare/clap on beats 2 and 4 (steps 5, 13) with organic variation
function agent.generate_snares(total_bars, intro_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        if intro_bars and bar < intro_bars then
            -- no snare in intro
        else
            for _, step in ipairs({5, 13}) do
                local vel = 95 + music.random(-5, 5)
                local t = step_time(bar, step)
                table.insert(events, {pitch = CLAP, time = t, velocity = math.floor(vel), duration = 0.1})
            end
        end
    end
    return events
end

-- Closed hi-hat on every 16th with velocity groove (accent 8th notes)
function agent.generate_closed_hats(total_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        for step = 1, 16 do
            local vel
            if step % 2 == 1 then
                vel = 75 + music.random(-3, 3)
            else
                vel = 60 + music.random(-3, 3)
            end
            local t = step_time(bar, step)
            table.insert(events, {pitch = HAT_CLOSED, time = t, velocity = math.floor(vel), duration = 0.03})
        end
    end
    return events
end

-- Open hi-hat on 8th note offbeats (steps 3, 7, 11, 15)
function agent.generate_open_hats(total_bars, intro_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        if intro_bars and bar < intro_bars then
            -- sparse open hats in intro
        else
            local pattern = {3, 7, 11, 15}
            if bar % 8 >= 4 then
                pattern = {3, 7, 11, 15}
            end
            for _, step in ipairs(pattern) do
                local vel = 55 + music.random(-3, 3)
                local t = step_time(bar, step)
                table.insert(events, {pitch = HAT_OPEN, time = t, velocity = math.floor(vel), duration = 0.12})
            end
        end
    end
    return events
end

-- Shaker/tambourine on 16th notes with humanized velocity
function agent.generate_shaker(total_bars, intro_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        if intro_bars and bar < intro_bars then
            -- no shaker in intro
        else
            for step = 1, 16 do
                if bar % 2 == 0 or step % 2 == 1 then
                    local vel = 35 + music.random(-5, 10)
                    local t = step_time(bar, step) + music.random(-0.01, 0.01)
                    table.insert(events, {pitch = SHAKER, time = t, velocity = math.floor(vel), duration = 0.04})
                end
            end
        end
    end
    return events
end

-- Tom fills at transition points
function agent.generate_tom_fills(total_bars)
    local events = {}
    local transition_bars = {}
    for bar = 0, total_bars - 1 do
        if bar > 0 and (bar % 32 == 0 or bar % 64 == 31) then
            table.insert(transition_bars, bar)
        end
    end
    for _, bar in ipairs(transition_bars) do
        for step = 9, 16 do
            local pitch = TOM_LO
            if step >= 13 then pitch = TOM_MID end
            if step >= 15 then pitch = TOM_HI end
            if step == 16 then pitch = TOM_MID end
            local vel = 70 + step * 2
            local t = step_time(bar, step)
            table.insert(events, {pitch = pitch, time = t, velocity = math.floor(vel), duration = 0.08})
        end
    end
    return events
end

-- Ride/crash accents
function agent.generate_rides(total_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        if bar > 0 and bar % 64 == 0 then
            local t = step_time(bar, 1)
            table.insert(events, {pitch = RIDE, time = t, velocity = 100, duration = 0.5})
        end
        if bar > 0 and bar % 32 == 0 then
            local t = step_time(bar, 1)
            table.insert(events, {pitch = CRASH, time = t, velocity = 80, duration = 0.3})
        end
    end
    return events
end

-- Organic percussion (low toms / tribal hits) adding psychedelic texture
function agent.generate_organic_perc(total_bars, intro_bars)
    local events = {}
    for bar = 0, total_bars - 1 do
        local step
        if bar % 2 == 0 then
            step = 6
        else
            step = 14
        end
        if not (intro_bars and bar < intro_bars) then
            local t = step_time(bar, step)
            local vel = 50 + music.random(-5, 5)
            table.insert(events, {pitch = PERC_LOW, time = t, velocity = math.floor(vel), duration = 0.1})
        end
    end
    return events
end

-- Main entry: generate all drums for a given number of bars
function agent.generate(total_bars, intro_bars)
    total_bars = total_bars or 64
    intro_bars = intro_bars or 16
    local all = {}
    local gens = {
        agent.generate_kicks(total_bars, intro_bars),
        agent.generate_snares(total_bars, intro_bars),
        agent.generate_closed_hats(total_bars),
        agent.generate_open_hats(total_bars, intro_bars),
        agent.generate_shaker(total_bars, intro_bars),
        agent.generate_tom_fills(total_bars),
        agent.generate_rides(total_bars),
        agent.generate_organic_perc(total_bars, intro_bars),
    }
    for _, gen in ipairs(gens) do
        for _, event in ipairs(gen) do
            table.insert(all, event)
        end
    end
    table.sort(all, function(a, b) return a.time < b.time end)
    return all
end

-- Play all drum events through the music API
function agent.play(bars, intro_bars)
    local events = agent.generate(bars, intro_bars)
    for _, e in ipairs(events) do
        music.play_note{
            pitch = e.pitch,
            time = e.time,
            velocity = e.velocity,
            duration = e.duration
        }
    end
    return {type = "agent_complete", agent = "veilwalker_drums", bars = bars}
end

-- Auto-execute with default: play 8 bars, intro covers first 2
return agent.play(8, 2)
