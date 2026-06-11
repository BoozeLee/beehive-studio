-- Veilwalker's Offbeat Odyssey — Full Arrangement Master Script
-- Self-contained: all component agents inlined for Lua sandbox compatibility
--
-- Sections (138 BPM, 8:45 = ~302 bars):
--   0:00–1:30  Intro / Shadowed awakening  (bars 0–51)
--   1:30–3:30  First propulsion / Build     (bars 52–120)
--   3:30–5:00  Breakdown / Narrative peak   (bars 121–172)
--   5:00–7:30  Second build & climactic drop (bars 173–258)
--   7:30–8:45  Outro / Resolution           (bars 259–301)

local TOTAL_BARS = 302
local SECTIONS = {
    intro     = {0, 51},
    build     = {52, 120},
    breakdown = {121, 172},
    drop      = {173, 258},
    outro     = {259, 301},
}

-- MIDI constants
local KICK = 36; local CLAP = 39; local HAT_CLOSED = 42; local HAT_OPEN = 46
local RIDE = 51; local CRASH = 49; local SHAKER = 70; local TOM_HI = 50
local TOM_MID = 47; local TOM_LO = 45; local PERC_LOW = 60

-- E minor scale (octave 3-5)
local function snote(s, d) return s[((d-1)%#s)+1] end
local S3 = {52,54,55,57,59,60,62}
local S4 = {64,66,67,69,71,72,74}
local S5 = {76,78,79,81,83,84,86}

-- ═══════════════════════════════════════════
-- Section helper
-- ═══════════════════════════════════════════
local function in_sec(bar, name)
    local s = SECTIONS[name]
    return s and bar >= s[1] and bar < s[2]
end

-- ═══════════════════════════════════════════
-- 1. DRUM GENERATION
-- ═══════════════════════════════════════════
local function step_time(bar, step) return bar*4 + (step-1)*0.25 end

local function gen_kicks()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        local eng = (in_sec(bar,"intro") and 0.5)
            or (in_sec(bar,"breakdown") and 0.0)
            or (in_sec(bar,"build") and 0.85)
            or (in_sec(bar,"drop") and 1.0)
            or 0.6
        if eng > 0 then
            for step = 1, 16, 4 do
                local vel = step==1 and math.floor(127*eng) or math.floor(115*eng)
                e[#e+1] = {pitch=KICK, time=step_time(bar,step), velocity=vel, duration=0.35}
            end
        end
    end; return e
end

local function gen_snares()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        if in_sec(bar,"intro") or in_sec(bar,"breakdown") then
            -- skip snare
        else
            for _, s in ipairs({5,13}) do
                local vel = 95 + music.random(-5,5)
                e[#e+1] = {pitch=CLAP, time=step_time(bar,s), velocity=math.floor(vel), duration=0.1}
            end
        end
    end; return e
end

local function gen_hats()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        if in_sec(bar,"intro") then
            -- sparse intro hats every 8th
            for step = 1, 16, 2 do
                local t = step_time(bar,step)
                e[#e+1] = {pitch=HAT_CLOSED, time=t, velocity=50, duration=0.03}
            end
        elseif in_sec(bar,"breakdown") then
            -- skip
        else
            for step = 1, 16 do
                local vel = (step%2==1) and 75 or 60
                vel = vel + music.random(-3,3)
                e[#e+1] = {pitch=HAT_CLOSED, time=step_time(bar,step), velocity=math.floor(vel), duration=0.03}
            end
            for _, s in ipairs({3,7,11,15}) do
                local vel = 55 + music.random(-3,3)
                e[#e+1] = {pitch=HAT_OPEN, time=step_time(bar,s), velocity=math.floor(vel), duration=0.12}
            end
        end
    end; return e
end

local function gen_perc()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        if not (in_sec(bar,"intro") or in_sec(bar,"breakdown")) then
            for step = 1, 16 do
                local vel = 35 + music.random(-5,10)
                e[#e+1] = {pitch=SHAKER, time=step_time(bar,step), velocity=math.floor(vel), duration=0.04}
            end
            local step = (bar%2==0) and 6 or 14
            local t = step_time(bar,step)
            e[#e+1] = {pitch=PERC_LOW, time=t, velocity=math.floor(50+music.random(-5,5)), duration=0.1}
        end
        -- tom fills at section transitions
        if bar > 0 and (bar % 32 == 0 or bar % 64 == 31) then
            for step = 9, 16 do
                local p = (step<13) and TOM_LO or (step<15) and TOM_MID or (step==16) and TOM_MID or TOM_HI
                e[#e+1] = {pitch=p, time=step_time(bar,step), velocity=math.floor(70+step*2), duration=0.08}
            end
        end
        -- rides at major section boundaries
        if bar > 0 and bar % 64 == 0 then
            e[#e+1] = {pitch=RIDE, time=step_time(bar,1), velocity=100, duration=0.5}
        end
        if bar > 0 and bar % 32 == 0 then
            e[#e+1] = {pitch=CRASH, time=step_time(bar,1), velocity=80, duration=0.3}
        end
    end; return e
end

-- ═══════════════════════════════════════════
-- 2. BASS GENERATION
-- ═══════════════════════════════════════════
local E1=40; local B1=47; local G1=43; local D2=50

local BASS_PAT = {
    pulse    = {E1,E1,E1,E1, E1,E1,E1,E1, E1,E1,E1,E1, E1,E1,E1,E1},
    ace_var  = {E1,B1,E1,E1, E1,B1,E1,E1, E1,B1,E1,E1, E1,B1,E1,E1},
    root_fifth={E1,B1,E1,B1, E1,B1,E1,B1, E1,B1,E1,B1, E1,B1,E1,B1},
    descend  = {E1,D2,B1,G1, E1,D2,B1,G1, E1,D2,B1,G1, E1,D2,B1,G1},
    root_8th = {E1,E1,E1,E1, E1,E1,E1,E1, E1,E1,E1,E1, E1,E1,E1,E1},
}

local BASS_SECTION_MAP = {
    intro = "pulse", build = "ace_var", breakdown = "pulse",
    drop = "root_fifth", peak = "root_fifth", outro = "root_8th"
}

local function gen_bass()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        local sec = "peak"
        for name, r in pairs(SECTIONS) do
            if bar>=r[1] and bar<r[2] then sec=name; break end
        end
        local pat = BASS_PAT[BASS_SECTION_MAP[sec] or "root_8th"]
        for step = 1, 16 do
            local t = bar*4 + (step-1)*0.25
            local vel_base = (step%4==1) and 110 or (step%4==2) and 95 or (step%4==3) and 90 or 85
            local vel = math.floor(vel_base + music.random(-3,3))
            e[#e+1] = {pitch=pat[step], time=t, velocity=vel, duration=0.18}
        end
    end; return e
end

-- ═══════════════════════════════════════════
-- 3. MELODY GENERATION
-- ═══════════════════════════════════════════
local function seq_note(scale, deg, oct)
    return snote(scale, deg) + (oct or 0)*12
end

local MOTIF = {
    {d=1,du=0.5},{d=3,du=0.25},{d=5,du=0.5},{d=3,du=0.25},
    {d=6,du=0.25},{d=5,du=0.25},{d=3,du=0.5},{d=2,du=0.25},
    {d=1,du=0.5},{d=2,du=0.25},{d=3,du=0.25},{d=5,du=0.5},
    {d=7,du=0.5},{d=6,du=0.25},{d=5,du=0.5},{d=1,du=0.25},
}

local function gen_melodies()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        if in_sec(bar,"intro") then
            if bar % 4 == 0 then
                local d = ({1,5,3})[(math.floor(bar/4)%3)+1]
                e[#e+1] = {pitch=seq_note(S4,d,1), time=bar*4, velocity=50, duration=1.0}
            end
        elseif in_sec(bar,"build") or in_sec(bar,"peak") or in_sec(bar,"drop") then
            local step = 0
            for _=1,16 do
                local idx = ((bar*16 + _ - 1) % #MOTIF) + 1
                local entry = MOTIF[idx]
                local pitch = seq_note(S4, entry.d, (bar%4==0) and 1 or 0)
                local t = bar*4 + step
                local vel = math.floor(100 + music.random(-5,5))
                e[#e+1] = {pitch=pitch, time=t, velocity=vel, duration=entry.du}
                step = step + entry.du
            end
        elseif in_sec(bar,"breakdown") then
            for _, d in ipairs({1,5}) do
                e[#e+1] = {pitch=seq_note(S3,d,0), time=bar*4, velocity=55, duration=3.9}
            end
        elseif in_sec(bar,"outro") then
            if bar % 2 == 0 then
                e[#e+1] = {pitch=seq_note(S4,1,0), time=bar*4, velocity=40, duration=2.0}
            end
        end
    end; return e
end

-- ═══════════════════════════════════════════
-- 4. ATMOSPHERE GENERATION
-- ═══════════════════════════════════════════
local function gen_atmospheres()
    local e = {}
    for bar = 0, TOTAL_BARS-1 do
        -- Deep pads (slow chord changes)
        if in_sec(bar,"intro") or in_sec(bar,"breakdown") or in_sec(bar,"drop") then
            if bar % 4 == 0 then
                local ct = math.floor(bar/4) % 4
                local degs = (ct==0) and {1,3,5} or (ct==1) and {4,6,1}
                    or (ct==2) and {5,7,2} or {3,5,7}
                for _, d in ipairs(degs) do
                    local pitch = seq_note(S4, d)
                    e[#e+1] = {pitch=pitch, time=bar*4, velocity=35, duration=3.9}
                end
            end
        end
        -- Shimmering high textures
        if in_sec(bar,"build") or in_sec(bar,"peak") or in_sec(bar,"drop") or in_sec(bar,"breakdown") then
            for step=1,8 do
                if step%2==1 or bar%2==0 then
                    local d = ((bar*8+step)%7)+1
                    local pitch = seq_note(S5, d)
                    local t = bar*4+(step-1)*0.5+music.random(-0.02,0.02)
                    e[#e+1] = {pitch=pitch, time=t, velocity=math.floor(25+music.random(-3,8)), duration=0.3}
                end
            end
        end
        -- Vocal-like textures (long sustained notes)
        if in_sec(bar,"intro") or in_sec(bar,"breakdown") or in_sec(bar,"drop") then
            local phrase_deg = ((bar%16)%5==0) and 5 or ((bar%16)%3==0) and 3 or ((bar%16)%7==0) and 7 or 1
            local pitch = seq_note(S4, phrase_deg)
            local t = bar*4 + (bar%4)
            local vel = 35 + music.random(-3,5)
            e[#e+1] = {pitch=pitch, time=t, velocity=math.floor(vel), duration=2.0}
            -- echo
            e[#e+1] = {pitch=pitch, time=t+1.5, velocity=math.floor(vel*0.4), duration=1.0}
        end
    end; return e
end

-- ═══════════════════════════════════════════
-- 5. BUILD SCRIPT (tension elements)
-- ═══════════════════════════════════════════
local function gen_builds()
    local e = {}
    -- 8-bar riser before drop (bars 168-175)
    for bar = 168, 175 do
        local progress = (bar-168)/8
        for step=1, 16 do
            local d = math.floor(progress*6) + (step%3) + 1
            local pitch = seq_note(S5, math.min(d,7))
            local t = step_time(bar,step)
            local vel = math.floor(20 + progress*50)
            e[#e+1] = {pitch=pitch, time=t, velocity=vel, duration=0.1+progress*0.3}
        end
    end
    return e
end

-- ═══════════════════════════════════════════
-- MAIN EXECUTION
-- ═══════════════════════════════════════════
music.set_bpm{bpm=138}

music.create_track{name="Kick", channel=0, instrument="drum", color="#FF4444"}
music.create_track{name="Snare", channel=1, instrument="drum", color="#FF8844"}
music.create_track{name="Hats", channel=2, instrument="drum", color="#FFCC44"}
music.create_track{name="Percussion", channel=3, instrument="drum", color="#88FF44"}
music.create_track{name="Bass", channel=4, instrument="synth", color="#4444FF"}
music.create_track{name="Lead", channel=5, instrument="synth", color="#8844FF"}
music.create_track{name="Pads", channel=6, instrument="pad", color="#FF44FF"}
music.create_track{name="Atmospheres", channel=7, instrument="fx", color="#44FFFF"}
music.create_track{name="Vocals", channel=8, instrument="fx", color="#FF88AA"}

-- Initial mixer state (intro)
music.set_volume{channel=7, volume=0.6}
music.set_volume{channel=8, volume=0.4}
music.set_volume{channel=6, volume=0.5}
music.set_volume{channel=4, volume=0.0}
music.set_mute{channel=0, muted=true}
music.set_mute{channel=1, muted=true}
music.set_mute{channel=2, muted=true}
music.set_mute{channel=3, muted=true}
music.set_mute{channel=5, muted=true}

-- Generate all note events
local all_events = {}

local function add_events(t)
    for _, ev in ipairs(t) do all_events[#all_events+1] = ev end
end

add_events(gen_kicks())
add_events(gen_snares())
add_events(gen_hats())
add_events(gen_perc())
add_events(gen_bass())
add_events(gen_melodies())
add_events(gen_atmospheres())
add_events(gen_builds())

-- Sort by time
table.sort(all_events, function(a, b) return a.time < b.time end)

-- Play all events through the music API
for _, e in ipairs(all_events) do
    music.play_note{
        pitch = e.pitch,
        time = e.time,
        velocity = e.velocity,
        duration = e.duration
    }
end

return {type = "agent_complete", agent = "veilwalker_arrangement", bars = TOTAL_BARS, events = #all_events}
