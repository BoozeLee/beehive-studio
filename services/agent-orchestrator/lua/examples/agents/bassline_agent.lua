-- Bassline Generation Agent
-- Creates basslines in different styles

local agent = {}

local SCALES = {
    techno = {0, 2, 4, 5, 7, 9, 11},
    house = {0, 2, 4, 7, 9},
    acid = {0, 3, 5, 7, 10},
    dubstep = {0, 3, 5, 7, 8, 10},
    ambient = {0, 2, 5, 7, 9},
}

local STYLES = {
    walking = function(scale, root, step, bar)
        return scale[(step % #scale) + 1]
    end,
    pedal = function(scale, root, step, bar)
        return root
    end,
    octave_jump = function(scale, root, step, bar)
        if step % 2 == 0 then
            return root + 12
        end
        return root
    end,
    arpeggio = function(scale, root, step, bar)
        return root + scale[(step % #scale) + 1]
    end,
}

function agent.generate(bars, key, genre, style)
    bars = bars or 8
    key = key or "C"
    genre = genre or "techno"
    style = style or "walking"

    local root = 36  -- Default C1
    if key == "D" then root = 38 end
    if key == "E" then root = 40 end
    if key == "F" then root = 41 end
    if key == "G" then root = 43 end
    if key == "A" then root = 45 end
    if key == "B" then root = 47 end

    local scale = SCALES[genre] or SCALES.techno
    local pattern_fn = STYLES[style] or STYLES.walking

    for bar = 0, bars - 1 do
        for step = 0, 15 do
            local beat = bar * 4 + step * 0.25
            local interval = pattern_fn(scale, root, step, bar)
            local pitch = root + interval

            -- Vary velocity for feel
            local vel = 100
            if step % 4 == 0 then vel = 115 end  -- accent downbeat
            if step % 8 == 7 then vel = 85 end   -- softer offbeat

            music.play_note{
                pitch = pitch,
                duration = 0.22,
                velocity = vel,
                time = beat
            }
        end
    end

    return { type = "agent_complete", agent = "bassline", bars = bars, genre = genre, style = style }
end

return agent
