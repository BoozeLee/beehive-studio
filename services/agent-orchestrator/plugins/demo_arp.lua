-- Demo third-party Lua agent: ascending acid arpeggio.
-- Dropped into the plugins/ dir; discovered + loaded by the Agent SDK.
local notes = {}
for i = 0, 7 do
  notes[#notes + 1] = music.play_note{
    pitch = 48 + (i % 4) * 3,
    duration = 0.25,
    velocity = 90 + (i % 2) * 20,
    time = i * 0.25,
  }
end
return notes
