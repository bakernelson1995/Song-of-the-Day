import React, { useState, useEffect, useMemo, useCallback } from "react";
import { loadData, saveData, subscribeToData } from "./firebase";

// ---------- Fallback pool: used only if the live AI suggestion request fails ----------
const FALLBACK_POOL = [
  { title: "Gymnopédie No. 1", artist: "Erik Satie", genre: "Classical" },
  { title: "Clair de Lune", artist: "Claude Debussy", genre: "Classical" },
  { title: "Spiegel im Spiegel", artist: "Arvo Pärt", genre: "Classical" },
  { title: "Prelude No. 1 in C Major", artist: "J.S. Bach", genre: "Classical" },
  { title: "Nuvole Bianche", artist: "Ludovico Einaudi", genre: "Instrumental" },
  { title: "Comptine d'un autre été", artist: "Yann Tiersen", genre: "Instrumental" },
  { title: "River Flows in You", artist: "Yiruma", genre: "Instrumental" },
  { title: "Metamorphosis Two", artist: "Philip Glass", genre: "Instrumental" },
  { title: "On the Nature of Daylight", artist: "Max Richter", genre: "Instrumental" },
  { title: "Porz Goret", artist: "Yann Tiersen", genre: "Instrumental" },
  { title: "So What", artist: "Miles Davis", genre: "Jazz" },
  { title: "Blue in Green", artist: "Miles Davis", genre: "Jazz" },
  { title: "Cantaloupe Island", artist: "Herbie Hancock", genre: "Jazz" },
  { title: "Sing, Sing, Sing", artist: "Benny Goodman", genre: "Jazz" },
  { title: "Take the A Train", artist: "Duke Ellington", genre: "Jazz" },
  { title: "Oblivion", artist: "Astor Piazzolla", genre: "World" },
  { title: "Libertango", artist: "Astor Piazzolla", genre: "World" },
  { title: "Mediterranean Sundance", artist: "Al Di Meola & Paco de Lucía", genre: "World" },
  { title: "Djobi Djoba", artist: "Gipsy Kings", genre: "World" },
  { title: "Skinny Love", artist: "Bon Iver", genre: "Indie/Folk" },
  { title: "Rivers and Roads", artist: "The Head and the Heart", genre: "Indie/Folk" },
  { title: "Home", artist: "Edward Sharpe & The Magnetic Zeros", genre: "Indie/Folk" },
  { title: "Ophelia", artist: "The Lumineers", genre: "Indie/Folk" },
  { title: "First Day of My Life", artist: "Bright Eyes", genre: "Indie/Folk" },
  { title: "The Only Moment We Were Alone", artist: "Explosions in the Sky", genre: "Indie/Folk" },
  { title: "Your Hand in Mine", artist: "Explosions in the Sky", genre: "Indie/Folk" },
  { title: "Married Life", artist: "Michael Giacchino", genre: "Soundtrack" },
  { title: "Concerning Hobbits", artist: "Howard Shore", genre: "Soundtrack" },
  { title: "Merry-Go-Round of Life", artist: "Joe Hisaishi", genre: "Soundtrack" },
  { title: "One Summer's Day", artist: "Joe Hisaishi", genre: "Soundtrack" },
  { title: "Time", artist: "Hans Zimmer", genre: "Soundtrack" },
  { title: "I Can't Help Myself (Sugar Pie, Honey Bunch)", artist: "Four Tops", genre: "Oldies/Motown" },
  { title: "Ain't No Mountain High Enough", artist: "Marvin Gaye & Tammi Terrell", genre: "Oldies/Motown" },
  { title: "Dancing in the Moonlight", artist: "King Harvest", genre: "Oldies/Motown" },
  { title: "My Girl", artist: "The Temptations", genre: "Oldies/Motown" },
  { title: "September", artist: "Earth, Wind & Fire", genre: "Oldies/Motown" },
  { title: "Boogie Wonderland", artist: "Earth, Wind & Fire", genre: "Oldies/Motown" },
  { title: "Reflections of Passion", artist: "Yanni", genre: "Instrumental" },
];

const PICK_GENRE_OPTIONS = [
  "Surprise me",
  "Classical",
  "Instrumental",
  "Jazz",
  "Blues",
  "World",
  "Indie/Folk",
  "Bluegrass",
  "Country",
  "Soundtrack",
  "Oldies/Motown",
  "R&B/Soul",
  "Pop",
  "Rock",
  "Punk",
  "Metal",
  "Rap/Hip-Hop",
  "Electronic",
  "Reggae",
  "Latin",
];
const REAL_GENRES = PICK_GENRE_OPTIONS.filter((g) => g !== "Surprise me");
const uid = () => Math.random().toString(36).slice(2, 10);

// Lightweight first-pass check — catches obvious cases in a title/artist string.
// Not a substitute for actually previewing the song before class.
const FLAG_WORDS = [
  "fuck", "shit", "bitch", "ass", "dick", "pussy", "nigga", "nigger", "cunt",
  "whore", "slut", "cock", "faggot", "damn", "hell", "sex", "porn", "drug",
  "cocaine", "molly", "weed", "kill", "murder", "suicide", "rape",
];

function containsFlaggedWord(str) {
  const lower = (str || "").toLowerCase();
  return FLAG_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(lower));
}

function getWeekInfo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (dt) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { key: monday.toISOString().slice(0, 10), label: `${fmt(monday)} – ${fmt(sunday)}` };
}

function getMonthInfo(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { key, label };
}

function defaultData() {
  return { names: ["Mr. Baker", "Mr. Sauve"], picks: [], yearFilterEnabled: true };
}

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [filterGenre, setFilterGenre] = useState("All");
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState("recent");
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState(null);
  const [newSong, setNewSong] = useState({ title: "", artist: "", genre: "Instrumental", previewed: false });
  const [justPicked, setJustPicked] = useState(null);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState(null);
  const [insightsTab, setInsightsTab] = useState("weekly");
  const [bothThreshold, setBothThreshold] = useState(8);
  const [currentUser, setCurrentUser] = useState(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [identitySearch, setIdentitySearch] = useState("");
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("my-identity");
      if (saved) setCurrentUser(saved);
    } catch {
      // no saved identity yet — that's fine
    } finally {
      setIdentityLoaded(true);
    }
  }, []);

  const chooseIdentity = (name) => {
    setCurrentUser(name);
    setShowIdentityPicker(false);
    setIdentitySearch("");
    try {
      localStorage.setItem("my-identity", name);
    } catch {
      // if this fails, the pick still works for the current session
    }
  };

  useEffect(() => {
    if (data && currentUser && !data.names.includes(currentUser)) {
      setCurrentUser(null);
    }
  }, [data, currentUser]);

  useEffect(() => {
    const unsubscribe = subscribeToData(
      (newData) => {
        setData(newData || defaultData());
        setLoading(false);
      },
      () => {
        setError("Couldn't load — check your connection and try again.");
        setData(defaultData());
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const save = useCallback(async (next) => {
    setData(next);
    setSaving(true);
    try {
      await saveData(next);
    } catch (e) {
      setError("Couldn't save — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  const pickSong = async () => {
    setPicking(true);
    setPickError(null);

    const usedKeys = new Set(data.picks.map((p) => `${p.title.toLowerCase()}::${p.artist.toLowerCase()}`));
    const recentList = data.picks
      .slice(0, 60)
      .map((p) => `${p.title} — ${p.artist}`)
      .join("; ");

    // Every coded genre is equally likely — the person never chooses this.
    const rolledGenre = REAL_GENRES[Math.floor(Math.random() * REAL_GENRES.length)];

    try {
      const response = await fetch("/api/pick-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genre: rolledGenre,
          exclude: recentList,
          yearFilter: data.yearFilterEnabled !== false,
        }),
      });

      const json = await response.json();
      const textBlock = (json.content || []).find((b) => b.type === "text");
      if (!textBlock) throw new Error("No text in response");
      const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      const suggestion = JSON.parse(cleaned);

      if (!suggestion.title || !suggestion.artist) throw new Error("Malformed suggestion");

      const key = `${suggestion.title.toLowerCase()}::${suggestion.artist.toLowerCase()}`;
      if (usedKeys.has(key)) {
        // extremely rare — the model repeated something despite the exclude list
        throw new Error("Duplicate suggestion");
      }

      const flagged = containsFlaggedWord(suggestion.title) || containsFlaggedWord(suggestion.artist);
      const entry = {
        id: uid(),
        title: suggestion.title,
        artist: suggestion.artist,
        genre: suggestion.genre || rolledGenre,
        reason: suggestion.reason || "",
        date: new Date().toISOString().slice(0, 10),
        ratings: data.names.map(() => null),
        source: "ai",
        previewed: false,
        flagged,
      };
      await save({ ...data, picks: [entry, ...data.picks] });
      setJustPicked(entry.id);
    } catch (e) {
      // Fall back to the small local pool so the app still works if the request fails
      let candidates = FALLBACK_POOL.filter(
        (s) => !usedKeys.has(`${s.title.toLowerCase()}::${s.artist.toLowerCase()}`)
      );
      candidates = candidates.filter((s) => s.genre === rolledGenre);
      if (candidates.length === 0) {
        candidates = FALLBACK_POOL.filter(
          (s) => !usedKeys.has(`${s.title.toLowerCase()}::${s.artist.toLowerCase()}`)
        );
      }
      if (candidates.length === 0) candidates = FALLBACK_POOL;
      const choice = candidates[Math.floor(Math.random() * candidates.length)];
      const entry = {
        id: uid(),
        title: choice.title,
        artist: choice.artist,
        genre: choice.genre,
        date: new Date().toISOString().slice(0, 10),
        ratings: data.names.map(() => null),
        source: "pool-fallback",
        previewed: false,
        flagged: false,
      };
      await save({ ...data, picks: [entry, ...data.picks] });
      setJustPicked(entry.id);
      setPickError("Couldn't reach the song generator, so we grabbed one from the backup list instead.");
    } finally {
      setPicking(false);
    }
  };

  const addCustomSong = () => {
    if (!newSong.title.trim() || !newSong.artist.trim() || !newSong.previewed) return;
    const flagged = containsFlaggedWord(newSong.title) || containsFlaggedWord(newSong.artist);
    const entry = {
      id: uid(),
      title: newSong.title.trim(),
      artist: newSong.artist.trim(),
      genre: newSong.genre,
      date: new Date().toISOString().slice(0, 10),
      ratings: data.names.map(() => null),
      custom: true,
      previewed: true,
      flagged,
    };
    save({ ...data, picks: [entry, ...data.picks] });
    setJustPicked(entry.id);
    setNewSong({ title: "", artist: "", genre: "Instrumental", previewed: false });
    setShowAdd(false);
  };

  const rate = (pickId, personIdx, value) => {
    const v = value === "" ? null : Math.max(0, Math.min(10, Number(value)));
    const picks = data.picks.map((p) => {
      if (p.id !== pickId) return p;
      const ratings = [...p.ratings];
      while (ratings.length <= personIdx) ratings.push(null);
      ratings[personIdx] = v;
      return { ...p, ratings };
    });
    save({ ...data, picks });
  };

  const renameTeacher = (idx, val) => {
    const names = [...data.names];
    names[idx] = val;
    save({ ...data, names });
  };

  const addTeacher = () => {
    const name = newTeacherName.trim();
    if (!name) return;
    const names = [...data.names, name];
    const picks = data.picks.map((p) => ({ ...p, ratings: [...p.ratings, null] }));
    save({ ...data, names, picks });
    setNewTeacherName("");
  };

  const removeTeacher = (idx) => {
    if (data.names.length <= 2) return; // keep at least 2 teachers
    const names = data.names.filter((_, i) => i !== idx);
    const picks = data.picks.map((p) => ({
      ...p,
      ratings: p.ratings.filter((_, i) => i !== idx),
    }));
    save({ ...data, names, picks });
  };

  const markPreviewed = (pickId) => {
    const picks = data.picks.map((p) =>
      p.id === pickId ? { ...p, previewed: !p.previewed, rejected: false } : p
    );
    save({ ...data, picks });
  };

  const markRejected = (pickId) => {
    const picks = data.picks.map((p) =>
      p.id === pickId ? { ...p, rejected: !p.rejected, previewed: false } : p
    );
    save({ ...data, picks });
  };

  const importHistoricalPicks = () => {
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch {
      setImportMsg("Couldn't parse that — make sure it's valid JSON.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setImportMsg("Expected a JSON array of songs.");
      return;
    }

    const existingKeys = new Set(
      data.picks.map((p) => `${p.title.toLowerCase()}::${p.artist.toLowerCase()}::${p.date}`)
    );
    let added = 0;
    let skipped = 0;
    const newPicks = [];

    parsed.forEach((item) => {
      if (!item || !item.title || !item.artist || !item.date) {
        skipped++;
        return;
      }
      const key = `${String(item.title).toLowerCase()}::${String(item.artist).toLowerCase()}::${item.date}`;
      if (existingKeys.has(key)) {
        skipped++;
        return;
      }
      existingKeys.add(key);

      const ratingsSource = item.ratings || {};
      const ratings = data.names.map((n) =>
        ratingsSource[n] !== undefined && ratingsSource[n] !== null ? Number(ratingsSource[n]) : null
      );

      newPicks.push({
        id: uid(),
        title: item.title,
        artist: item.artist,
        genre: item.genre || "Unspecified",
        date: item.date,
        ratings,
        source: "historical-import",
        previewed: true,
        rejected: false,
        flagged: containsFlaggedWord(item.title) || containsFlaggedWord(item.artist),
      });
      added++;
    });

    if (newPicks.length > 0) {
      save({ ...data, picks: [...data.picks, ...newPicks] });
    }
    setImportMsg(
      `Imported ${added} song${added === 1 ? "" : "s"}${
        skipped ? `, skipped ${skipped} (duplicate or missing title/artist/date)` : ""
      }.`
    );
    setImportText("");
  };

  const deletePick = (id) => {
    save({ ...data, picks: data.picks.filter((p) => p.id !== id) });
  };

  const avg = (ratings) => {
    const vals = ratings.filter((r) => r !== null && r !== undefined);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  const today = new Date().toISOString().slice(0, 10);
  const pickedToday = data?.picks?.find((p) => p.date === today);
  const canRoll = !pickedToday || pickedToday.rejected;

  // Today's pick is excluded from every ranking/trend/history view below —
  // its average only appears in the main card, and only after you've rated
  // it yourself (see MyRatingBlock). This avoids anchoring anyone's rating
  // on a number they saw before they'd formed their own opinion.
  const picksExcludingToday = useMemo(() => {
    if (!data) return [];
    return pickedToday ? data.picks.filter((p) => p.id !== pickedToday.id) : data.picks;
  }, [data, pickedToday]);

  const weeklyTop = useMemo(() => {
    if (!data) return [];
    const groups = {};
    picksExcludingToday.forEach((p) => {
      const a = avg(p.ratings);
      if (a === null) return;
      const { key, label } = getWeekInfo(p.date);
      if (!groups[key] || a > groups[key]._avg) {
        groups[key] = { ...p, _avg: a, _label: label, _key: key };
      }
    });
    return Object.values(groups).sort((x, y) => (x._key < y._key ? 1 : -1));
  }, [data, picksExcludingToday]);

  const monthlyTop = useMemo(() => {
    if (!data) return [];
    const groups = {};
    picksExcludingToday.forEach((p) => {
      const a = avg(p.ratings);
      if (a === null) return;
      const { key, label } = getMonthInfo(p.date);
      if (!groups[key] || a > groups[key]._avg) {
        groups[key] = { ...p, _avg: a, _label: label, _key: key };
      }
    });
    return Object.values(groups).sort((x, y) => (x._key < y._key ? 1 : -1));
  }, [data, picksExcludingToday]);

  const bothLoved = useMemo(() => {
    if (!data) return [];
    return picksExcludingToday
      .filter((p) => {
        const vals = p.ratings.filter((r) => r !== null && r !== undefined);
        return vals.length === data.names.length && vals.every((v) => v >= bothThreshold);
      })
      .map((p) => ({ ...p, _avg: avg(p.ratings) }))
      .sort((x, y) => y._avg - x._avg);
  }, [data, picksExcludingToday, bothThreshold]);

  const genreTrends = useMemo(() => {
    if (!data) return [];
    const groups = {};
    picksExcludingToday.forEach((p) => {
      const a = avg(p.ratings);
      if (a === null) return;
      if (!groups[p.genre]) groups[p.genre] = { total: 0, count: 0 };
      groups[p.genre].total += a;
      groups[p.genre].count += 1;
    });
    return Object.entries(groups)
      .map(([genre, { total, count }]) => ({ genre, avg: total / count, count }))
      .sort((a, b) => b.avg - a.avg);
  }, [data, picksExcludingToday]);

  const powerRankings = useMemo(() => {
    if (!data) return [];
    return picksExcludingToday
      .map((p) => ({ ...p, _avg: avg(p.ratings) }))
      .filter((p) => p._avg !== null)
      .sort((a, b) => b._avg - a._avg)
      .slice(0, 10);
  }, [data, picksExcludingToday]);

  const historyGenres = useMemo(() => {
    if (!data) return ["All"];
    return ["All", ...Array.from(new Set(data.picks.map((p) => p.genre))).sort()];
  }, [data]);

  const identityMatches = useMemo(() => {
    if (!data) return [];
    const q = identitySearch.trim().toLowerCase();
    if (!q) return data.names;
    return data.names.filter((n) => n.toLowerCase().includes(q));
  }, [data, identitySearch]);

  const visiblePicks = useMemo(() => {
    if (!data) return [];
    let list = [...picksExcludingToday];
    if (filterGenre !== "All") list = list.filter((p) => p.genre === filterGenre);
    if (minRating > 0) {
      list = list.filter((p) => {
        const a = avg(p.ratings);
        return a !== null && a >= minRating;
      });
    }
    if (sortBy === "recent") list.sort((a, b) => (a.date < b.date ? 1 : -1));
    if (sortBy === "oldest") list.sort((a, b) => (a.date > b.date ? 1 : -1));
    if (sortBy === "rating-high")
      list.sort((a, b) => (avg(b.ratings) ?? -1) - (avg(a.ratings) ?? -1));
    if (sortBy === "rating-low")
      list.sort((a, b) => (avg(a.ratings) ?? 11) - (avg(b.ratings) ?? 11));
    return list;
  }, [data, picksExcludingToday, filterGenre, minRating, sortBy]);

  if (loading) {
    return (
      <div style={styles.wrap}>
        <FontImport />
        <div style={styles.loadingText}>tuning up…</div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <FontImport />
      <div style={styles.board}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Song of the Day</h1>
            <p style={styles.subtitle}>
              {data.names.length === 2
                ? `${data.names[0]} & ${data.names[1]}'s shared classroom playlist`
                : `${data.names.slice(0, -1).join(", ")} & ${data.names[data.names.length - 1]}'s shared classroom playlist`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.ghostBtn} onClick={() => setShowImport((s) => !s)}>
              {showImport ? "close" : "import ⇪"}
            </button>
            <button style={styles.ghostBtn} onClick={() => setShowSettings((s) => !s)}>
              {showSettings ? "close" : "names ✎"}
            </button>
          </div>
        </header>

        {/* ---------- Identity: who am I, remembered for this browser/account ---------- */}
        <div style={styles.identityBar}>
          {currentUser ? (
            <>
              <span style={styles.identityText}>
                Rating as <strong>{currentUser}</strong>
              </span>
              <button style={styles.linkBtn} onClick={() => setShowIdentityPicker((s) => !s)}>
                {showIdentityPicker ? "cancel" : "not you? change"}
              </button>
            </>
          ) : (
            <>
              <span style={styles.identityText}>Who's rating?</span>
              <button style={styles.primaryBtnSmall} onClick={() => setShowIdentityPicker(true)}>
                Select your name
              </button>
            </>
          )}
        </div>

        {showIdentityPicker && (
          <div style={styles.settingsCard}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <input
                autoFocus
                style={styles.textInput}
                placeholder="Type to search your name…"
                value={identitySearch}
                onChange={(e) => setIdentitySearch(e.target.value)}
              />
              <div style={styles.identityResultsList}>
                {identityMatches.length === 0 ? (
                  <div style={styles.smallLabel}>
                    No match — check spelling, or ask a teacher to add your name in settings.
                  </div>
                ) : (
                  identityMatches.map((n) => (
                    <button key={n} style={styles.identityResultBtn} onClick={() => chooseIdentity(n)}>
                      {n}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {showImport && (
          <div style={styles.settingsCard}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
              <span style={styles.settingsLabel}>
                Paste historical picks as a JSON array. Each teacher's rating is matched by name —
                use the exact names shown above ({data.names.join(", ")}). Skips exact duplicates
                automatically.
              </span>
              <textarea
                style={styles.importTextarea}
                placeholder={`[\n  {"title": "Song Title", "artist": "Artist Name", "date": "2025-09-03", "genre": "Indie/Folk", "ratings": {"${data.names[0]}": 8, "${data.names[1]}": 9}}\n]`}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={6}
              />
              <button style={styles.primaryBtnSmall} onClick={importHistoricalPicks}>
                Import into history
              </button>
              {importMsg && <div style={styles.smallLabel}>{importMsg}</div>}
            </div>
          </div>
        )}

        {showSettings && (
          <div style={styles.settingsCard}>
            {data.names.map((name, i) => (
              <div key={i} style={styles.settingsRow}>
                <span style={styles.settingsLabel}>Teacher {i + 1}</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    style={styles.textInput}
                    value={name}
                    onChange={(e) => renameTeacher(i, e.target.value)}
                  />
                  {data.names.length > 2 && (
                    <button
                      style={styles.deleteBtnPlain}
                      title="Remove teacher"
                      onClick={() => removeTeacher(i)}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div style={styles.settingsRow}>
              <span style={styles.settingsLabel}>Add a teacher</span>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  style={styles.textInput}
                  placeholder="Name"
                  value={newTeacherName}
                  onChange={(e) => setNewTeacherName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTeacher()}
                />
                <button style={styles.primaryBtnSmall} onClick={addTeacher}>
                  Add
                </button>
              </div>
            </div>
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={data.yearFilterEnabled !== false}
                onChange={(e) => save({ ...data, yearFilterEnabled: e.target.checked })}
              />
              <span>Only suggest songs released 1982–present</span>
            </label>
          </div>
        )}

        {/* ---------- Today's pick / vinyl record ---------- */}
        <section style={styles.recordSection}>
          <div style={styles.recordWrap}>
            <div
              style={{
                ...styles.record,
                animation: pickedToday || picking ? "spin 8s linear infinite" : "none",
              }}
            >
              <div style={styles.recordLabel}>
                {picking ? (
                  <div style={styles.recordEmpty}>finding a song…</div>
                ) : pickedToday ? (
                  <>
                    <div style={styles.recordTitle}>{pickedToday.title}</div>
                    <div style={styles.recordArtist}>{pickedToday.artist}</div>
                    <div style={styles.recordGenre}>{pickedToday.genre}</div>
                  </>
                ) : (
                  <div style={styles.recordEmpty}>no pick yet today</div>
                )}
              </div>
            </div>
            <div style={styles.tonearm} />
          </div>

          <div style={styles.pickControls}>
            <button
              style={{
                ...styles.primaryBtn,
                opacity: canRoll ? 1 : 0.4,
                cursor: canRoll && !picking ? "pointer" : "not-allowed",
              }}
              onClick={canRoll ? pickSong : undefined}
              disabled={picking || !canRoll}
            >
              {picking
                ? "Thinking of one…"
                : !pickedToday
                ? "🎲 Pick today's song"
                : pickedToday.rejected
                ? "🎲 Re-roll today's song"
                : "Locked in for today"}
            </button>

            {pickedToday && !picking && (
              <div style={styles.headlinePick}>
                <div style={styles.headlineLabel}>Today's pick</div>
                <div style={styles.headlineTitle}>{pickedToday.title}</div>
                <div style={styles.headlineArtist}>{pickedToday.artist}</div>
                <span style={styles.headlineGenreTag}>{pickedToday.genre}</span>
              </div>
            )}

            {!canRoll && (
              <div style={styles.smallLabel}>
                One roll per calendar day — if a song fails preview, flag it below to unlock a re-roll.
              </div>
            )}
            {pickError && <div style={styles.warningBox}>{pickError}</div>}
            <button style={styles.linkBtn} onClick={() => setShowAdd((s) => !s)}>
              {showAdd ? "cancel" : "+ add our own song instead"}
            </button>

            {showAdd && (
              <div style={styles.addForm}>
                <input
                  style={styles.textInput}
                  placeholder="Song title"
                  value={newSong.title}
                  onChange={(e) => setNewSong({ ...newSong, title: e.target.value })}
                />
                <input
                  style={styles.textInput}
                  placeholder="Artist"
                  value={newSong.artist}
                  onChange={(e) => setNewSong({ ...newSong, artist: e.target.value })}
                />
                <select
                  style={styles.select}
                  value={newSong.genre}
                  onChange={(e) => setNewSong({ ...newSong, genre: e.target.value })}
                >
                  {PICK_GENRE_OPTIONS.filter((g) => g !== "Surprise me").map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                  <option value="Other">Other</option>
                </select>

                {(containsFlaggedWord(newSong.title) || containsFlaggedWord(newSong.artist)) && (
                  <div style={styles.warningBox}>
                    ⚠ Title or artist contains a word on our flag list. Double-check the lyrics
                    before adding.
                  </div>
                )}

                <label style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={newSong.previewed}
                    onChange={(e) => setNewSong({ ...newSong, previewed: e.target.checked })}
                  />
                  <span>I've previewed this song and it's classroom appropriate</span>
                </label>

                <button
                  style={{
                    ...styles.primaryBtnSmall,
                    opacity: newSong.title.trim() && newSong.artist.trim() && newSong.previewed ? 1 : 0.45,
                    cursor:
                      newSong.title.trim() && newSong.artist.trim() && newSong.previewed
                        ? "pointer"
                        : "not-allowed",
                  }}
                  disabled={!(newSong.title.trim() && newSong.artist.trim() && newSong.previewed)}
                  onClick={addCustomSong}
                >
                  Add as today's pick
                </button>
              </div>
            )}

            {pickedToday && (
              <>
                {pickedToday.reason && <div style={styles.reasonText}>{pickedToday.reason}</div>}
                <div style={styles.previewToggleRow}>
                  <AppropriatenessBadge pick={pickedToday} />
                  {!pickedToday.previewed && !pickedToday.rejected && (
                    <>
                      <button
                        style={styles.approveBtn}
                        onClick={() => markPreviewed(pickedToday.id)}
                      >
                        ✓ approve
                      </button>
                      <button
                        style={styles.rejectBtn}
                        onClick={() => markRejected(pickedToday.id)}
                      >
                        ✗ not appropriate
                      </button>
                    </>
                  )}
                  {pickedToday.rejected && (
                    <span style={styles.rerollHint}>Dice unlocked — roll again above.</span>
                  )}
                </div>
                <MyRatingBlock
                  pick={pickedToday}
                  names={data.names}
                  currentUser={currentUser}
                  onRate={rate}
                  onPickIdentity={() => setShowIdentityPicker(true)}
                />
              </>
            )}
          </div>
        </section>

        {/* ---------- Power Rankings: all-time top 10, always visible ---------- */}
        <section style={styles.powerSection}>
          <h2 style={styles.powerTitle}>🏆 Power Rankings</h2>
          <p style={styles.powerSubtitle}>All-time top 10, by average rating</p>
          <div style={styles.insightsList}>
            {powerRankings.length === 0 ? (
              <div style={styles.emptyState}>No rated songs yet — rate a few to build the rankings.</div>
            ) : (
              powerRankings.map((s, i) => (
                <div key={s.id} style={styles.insightRow}>
                  <span style={styles.rankBadge}>#{i + 1}</span>
                  <span style={styles.insightSongTitle}>{s.title}</span>
                  <span style={styles.insightSongArtist}>{s.artist}</span>
                  <span style={styles.insightWeekLabel}>{s.date}</span>
                  <span style={styles.insightScore}>★ {s._avg.toFixed(1)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* ---------- Insights / trends ---------- */}
        <section style={styles.insightsSection}>
          <h2 style={styles.historyTitle}>Trends &amp; highlights</h2>
          <div style={styles.tabBar}>
            {[
              { id: "weekly", label: "Best of the week" },
              { id: "monthly", label: "Best of the month" },
              { id: "both", label: "We all loved" },
              { id: "genre", label: "Genre trends" },
            ].map((t) => (
              <button
                key={t.id}
                style={insightsTab === t.id ? styles.tabBtnActive : styles.tabBtn}
                onClick={() => setInsightsTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {insightsTab === "weekly" && (
            <div style={styles.insightsList}>
              {weeklyTop.length === 0 ? (
                <div style={styles.emptyState}>No rated songs yet — rate a few to see weekly highlights.</div>
              ) : (
                weeklyTop.map((w) => (
                  <div key={w._key} style={styles.insightRow}>
                    <span style={styles.insightWeekLabel}>{w._label}</span>
                    <span style={styles.insightSongTitle}>{w.title}</span>
                    <span style={styles.insightSongArtist}>{w.artist}</span>
                    <span style={styles.insightScore}>★ {w._avg.toFixed(1)}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {insightsTab === "monthly" && (
            <div style={styles.insightsList}>
              {monthlyTop.length === 0 ? (
                <div style={styles.emptyState}>No rated songs yet — rate a few to see monthly highlights.</div>
              ) : (
                monthlyTop.map((m) => (
                  <div key={m._key} style={styles.insightRow}>
                    <span style={styles.insightWeekLabel}>{m._label}</span>
                    <span style={styles.insightSongTitle}>{m.title}</span>
                    <span style={styles.insightSongArtist}>{m.artist}</span>
                    <span style={styles.insightScore}>★ {m._avg.toFixed(1)}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {insightsTab === "both" && (
            <div>
              <div style={styles.thresholdRow}>
                <span style={styles.smallLabel}>Everyone rated at least</span>
                <select
                  style={styles.select}
                  value={bothThreshold}
                  onChange={(e) => setBothThreshold(Number(e.target.value))}
                >
                  {[10, 9, 8, 7, 6, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}/10
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.insightsList}>
                {bothLoved.length === 0 ? (
                  <div style={styles.emptyState}>
                    No songs yet where everyone rated {bothThreshold}+ — try lowering the threshold.
                  </div>
                ) : (
                  bothLoved.map((s) => (
                    <div key={s.id} style={styles.insightRow}>
                      <span style={styles.insightWeekLabel}>{s.date}</span>
                      <span style={styles.insightSongTitle}>{s.title}</span>
                      <span style={styles.insightSongArtist}>{s.artist}</span>
                      <span style={styles.insightScore}>★ {s._avg.toFixed(1)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {insightsTab === "genre" && (
            <div style={styles.insightsList}>
              {genreTrends.length === 0 ? (
                <div style={styles.emptyState}>No rated songs yet — rate a few to see genre trends.</div>
              ) : (
                genreTrends.map((g) => (
                  <div key={g.genre} style={styles.genreRow}>
                    <span style={styles.insightSongTitle}>{g.genre}</span>
                    <div style={styles.genreBarTrack}>
                      <div style={{ ...styles.genreBarFill, width: `${(g.avg / 10) * 100}%` }} />
                    </div>
                    <span style={styles.insightScore}>★ {g.avg.toFixed(1)}</span>
                    <span style={styles.genreCount}>({g.count})</span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* ---------- History ---------- */}
        <section style={styles.historySection}>
          <div style={styles.historyHeader}>
            <h2 style={styles.historyTitle}>Past picks ({data.picks.length})</h2>
            <div style={styles.filterBar}>
              <select
                style={styles.select}
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
              >
                {historyGenres.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                style={styles.select}
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
              >
                <option value={0}>Any rating</option>
                {[9, 8, 7, 6, 5, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}+ avg
                  </option>
                ))}
              </select>
              <select style={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="recent">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="rating-high">Highest rated</option>
                <option value="rating-low">Lowest rated</option>
              </select>
            </div>
          </div>

          {visiblePicks.length === 0 ? (
            <div style={styles.emptyState}>No songs match these filters yet.</div>
          ) : (
            <div style={styles.cardGrid}>
              {visiblePicks.map((p) => {
                const a = avg(p.ratings);
                return (
                  <div key={p.id} style={styles.card}>
                    <button style={styles.deleteBtn} onClick={() => deletePick(p.id)} title="Remove">
                      ×
                    </button>
                    <div style={styles.cardDate}>{p.date}</div>
                    <div style={styles.cardTitle}>{p.title}</div>
                    <div style={styles.cardArtist}>{p.artist}</div>
                    <div style={styles.cardTags}>
                      <span style={styles.tag}>{p.genre}</span>
                      {p.custom && <span style={styles.tagAlt}>your pick</span>}
                    </div>
                    <div style={styles.previewToggleRow}>
                      <AppropriatenessBadge pick={p} card />
                      {!p.previewed && !p.rejected && (
                        <>
                          <button style={styles.approveBtnCard} onClick={() => markPreviewed(p.id)}>
                            ✓
                          </button>
                          <button style={styles.rejectBtnCard} onClick={() => markRejected(p.id)}>
                            ✗
                          </button>
                        </>
                      )}
                    </div>
                    {p.reason && <div style={styles.cardReason}>{p.reason}</div>}
                    <div style={styles.avgBadge}>
                      {a === null
                        ? "unrated"
                        : `★ ${a.toFixed(1)} avg · ${p.ratings.filter((r) => r !== null && r !== undefined).length}/${data.names.length} rated`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer style={styles.footer}>
          {saving ? "saving…" : error ? error : "synced across everyone"}
        </footer>
      </div>
    </div>
  );
}

function AppropriatenessBadge({ pick, card }) {
  let label, style;
  if (pick.rejected) {
    label = "✗ marked not appropriate";
    style = card ? styles.badgeFlaggedCard : styles.badgeFlagged;
  } else if (pick.flagged) {
    label = "⚠ flagged — recheck lyrics";
    style = card ? styles.badgeFlaggedCard : styles.badgeFlagged;
  } else if (pick.source === "historical-import") {
    label = "📥 imported";
    style = card ? styles.badgeOkCard : styles.badgeOk;
  } else if (pick.previewed) {
    label = "✓ previewed";
    style = card ? styles.badgeOkCard : styles.badgeOk;
  } else {
    label = "not yet previewed";
    style = card ? styles.badgeUnknownCard : styles.badgeUnknown;
  }
  return <span style={style}>{label}</span>;
}

function MyRatingBlock({ pick, names, currentUser, onRate, onPickIdentity }) {
  const vals = pick.ratings.filter((r) => r !== null && r !== undefined);
  const avgVal = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const myIndex = currentUser ? names.indexOf(currentUser) : -1;
  const iHaveRated = myIndex !== -1 && pick.ratings[myIndex] !== null && pick.ratings[myIndex] !== undefined;

  return (
    <div style={styles.myRatingWrap}>
      {iHaveRated ? (
        <div style={styles.aggregateLine}>
          {avgVal === null ? "unrated so far" : `★ ${avgVal.toFixed(1)} avg`} · {vals.length}/{names.length} rated
        </div>
      ) : (
        <div style={styles.aggregateHiddenLine}>
          Rate this song to see how everyone else rated it
        </div>
      )}
      {myIndex === -1 ? (
        <button style={styles.linkBtn} onClick={onPickIdentity}>
          select your name to rate this song
        </button>
      ) : (
        <div style={styles.ratingItem}>
          <span style={styles.ratingLabel}>Your rating ({currentUser})</span>
          <input
            type="number"
            min="0"
            max="10"
            step="1"
            placeholder="–"
            value={pick.ratings[myIndex] ?? ""}
            onChange={(e) => onRate(pick.id, myIndex, e.target.value)}
            style={styles.ratingInput}
          />
          <span style={styles.ratingOutOf}>/10</span>
        </div>
      )}
    </div>
  );
}

function FontImport() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      * { box-sizing: border-box; }
      input, select, button { font-family: 'Space Grotesk', sans-serif; }
      input[type=number]::-webkit-inner-spin-button { opacity: 1; }
    `}</style>
  );
}

const COLORS = {
  bg: "#16261D",
  bgAlt: "#1F3527",
  chalk: "#F3EFE4",
  chalkDim: "#C9C2AE",
  yellow: "#E8C468",
  coral: "#E2846A",
  blue: "#7FB0BA",
  line: "rgba(243,239,228,0.14)",
};

const styles = {
  wrap: {
    minHeight: "100vh",
    background: `radial-gradient(ellipse at top, ${COLORS.bgAlt} 0%, ${COLORS.bg} 65%)`,
    padding: "28px 16px 60px",
    fontFamily: "'Space Grotesk', sans-serif",
    color: COLORS.chalk,
  },
  loadingText: {
    textAlign: "center",
    fontFamily: "'Caveat', cursive",
    fontSize: 28,
    color: COLORS.chalk,
    paddingTop: 80,
  },
  board: { maxWidth: 780, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  title: {
    fontFamily: "'Caveat', cursive",
    fontWeight: 700,
    fontSize: 52,
    margin: 0,
    color: COLORS.yellow,
    lineHeight: 1,
  },
  subtitle: { margin: "4px 0 0", fontSize: 14, color: COLORS.chalkDim },
  ghostBtn: {
    background: "transparent",
    border: `1px solid ${COLORS.line}`,
    color: COLORS.chalkDim,
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  identityBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: "rgba(127,176,186,0.10)",
    border: `1px solid ${COLORS.blue}`,
    borderRadius: 12,
    padding: "8px 14px",
    marginBottom: 14,
    flexWrap: "wrap",
  },
  identityText: { fontSize: 13, color: COLORS.chalk },
  identityResultsList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    maxHeight: 220,
    overflowY: "auto",
  },
  identityResultBtn: {
    textAlign: "left",
    background: COLORS.bg,
    border: `1px solid ${COLORS.line}`,
    color: COLORS.chalk,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    cursor: "pointer",
  },
  settingsCard: {
    background: COLORS.bgAlt,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    display: "flex",
    gap: 16,
    flexWrap: "wrap",
  },
  settingsRow: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: COLORS.chalkDim },
  settingsLabel: { fontSize: 12, color: COLORS.chalkDim },
  deleteBtnPlain: {
    background: "transparent",
    border: `1px solid ${COLORS.line}`,
    color: COLORS.coral,
    borderRadius: 6,
    width: 30,
    height: 30,
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
  },
  textInput: {
    background: COLORS.bg,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    padding: "8px 10px",
    color: COLORS.chalk,
    fontSize: 14,
    outline: "none",
  },
  importTextarea: {
    background: COLORS.bg,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    padding: "10px",
    color: COLORS.chalk,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    outline: "none",
    resize: "vertical",
    width: "100%",
  },
  recordSection: {
    display: "flex",
    gap: 28,
    alignItems: "center",
    flexWrap: "wrap",
    background: "rgba(0,0,0,0.15)",
    border: `1px solid ${COLORS.line}`,
    borderRadius: 20,
    padding: 22,
    marginBottom: 30,
  },
  recordWrap: { position: "relative", flex: "0 0 auto", margin: "0 auto" },
  record: {
    width: 190,
    height: 190,
    borderRadius: "50%",
    background:
      "repeating-radial-gradient(circle at center, #0c0c0c 0px, #0c0c0c 2px, #1a1a1a 3px, #1a1a1a 5px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    border: "2px solid #060606",
  },
  recordLabel: {
    width: 96,
    height: 96,
    borderRadius: "50%",
    background: COLORS.coral,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 8,
    border: "3px solid #0c0c0c",
  },
  recordTitle: { fontSize: 11, fontWeight: 700, color: "#241009", lineHeight: 1.15 },
  recordArtist: { fontSize: 9, color: "#3a1c0f", marginTop: 3 },
  recordGenre: {
    fontSize: 8,
    marginTop: 4,
    color: "#3a1c0f",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recordEmpty: { fontSize: 11, color: "#3a1c0f", fontStyle: "italic" },
  tonearm: {
    position: "absolute",
    top: -6,
    right: -18,
    width: 6,
    height: 70,
    background: "#8a8a8a",
    borderRadius: 4,
    transform: "rotate(28deg)",
    transformOrigin: "top center",
  },
  pickControls: { flex: "1 1 260px", display: "flex", flexDirection: "column", gap: 10 },
  headlinePick: {
    background: "rgba(232,196,104,0.08)",
    border: `1px solid ${COLORS.yellow}`,
    borderRadius: 12,
    padding: "12px 16px",
  },
  headlineLabel: {
    fontSize: 11,
    color: COLORS.chalkDim,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: 600,
    marginBottom: 4,
  },
  headlineTitle: {
    fontFamily: "'Caveat', cursive",
    fontSize: 30,
    fontWeight: 700,
    color: COLORS.yellow,
    lineHeight: 1.1,
  },
  headlineArtist: { fontSize: 15, color: COLORS.chalk, marginTop: 2, fontWeight: 500 },
  headlineGenreTag: {
    display: "inline-block",
    marginTop: 8,
    fontSize: 11,
    fontWeight: 600,
    color: "#a8492b",
    background: "rgba(226,132,106,0.18)",
    padding: "3px 10px",
    borderRadius: 20,
  },
  smallLabel: { fontSize: 12, color: COLORS.chalkDim },
  select: {
    background: COLORS.bg,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    padding: "8px 10px",
    color: COLORS.chalk,
    fontSize: 13,
    outline: "none",
  },
  primaryBtn: {
    background: COLORS.yellow,
    color: "#241a05",
    border: "none",
    borderRadius: 10,
    padding: "12px 16px",
    fontWeight: 600,
    fontSize: 15,
    cursor: "pointer",
  },
  primaryBtnSmall: {
    background: COLORS.yellow,
    color: "#241a05",
    border: "none",
    borderRadius: 8,
    padding: "8px 12px",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: COLORS.blue,
    fontSize: 12,
    textAlign: "left",
    cursor: "pointer",
    padding: 0,
  },
  addForm: { display: "flex", flexDirection: "column", gap: 8, marginTop: 4 },
  warningBox: {
    background: "rgba(226,132,106,0.16)",
    border: `1px solid ${COLORS.coral}`,
    color: COLORS.coral,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.4,
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: COLORS.chalk,
  },
  reasonText: {
    fontSize: 12,
    color: COLORS.chalkDim,
    fontStyle: "italic",
    marginTop: 2,
  },
  previewToggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  approveBtn: {
    background: "rgba(143,211,160,0.16)",
    border: "1px solid rgba(143,211,160,0.55)",
    color: "#8fd3a0",
    borderRadius: 20,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  rejectBtn: {
    background: "rgba(226,132,106,0.16)",
    border: `1px solid ${COLORS.coral}`,
    color: COLORS.coral,
    borderRadius: 20,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  approveBtnCard: {
    background: "rgba(63,168,90,0.16)",
    border: "1px solid rgba(63,168,90,0.5)",
    color: "#2f7a45",
    borderRadius: 20,
    width: 22,
    height: 22,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
  },
  rejectBtnCard: {
    background: "rgba(226,132,106,0.18)",
    border: "1px solid rgba(168,73,43,0.5)",
    color: "#a8492b",
    borderRadius: 20,
    width: 22,
    height: 22,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    lineHeight: 1,
  },
  rerollHint: {
    fontSize: 12,
    color: COLORS.coral,
    fontWeight: 600,
  },
  checkboxRowSmall: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    color: COLORS.chalkDim,
  },
  checkboxRowSmallCard: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    color: "#5c5340",
  },
  cardReason: {
    fontSize: 11,
    color: "#5c5340",
    fontStyle: "italic",
    marginBottom: 6,
  },
  badgeOk: {
    display: "inline-block",
    fontSize: 11,
    color: "#8fd3a0",
    background: "rgba(143,211,160,0.14)",
    border: "1px solid rgba(143,211,160,0.4)",
    borderRadius: 20,
    padding: "3px 10px",
    marginTop: 6,
    width: "fit-content",
  },
  badgeUnknown: {
    display: "inline-block",
    fontSize: 11,
    color: COLORS.yellow,
    background: "rgba(232,196,104,0.14)",
    border: `1px solid ${COLORS.yellow}`,
    borderRadius: 20,
    padding: "3px 10px",
    marginTop: 6,
    width: "fit-content",
  },
  badgeFlagged: {
    display: "inline-block",
    fontSize: 11,
    color: COLORS.coral,
    background: "rgba(226,132,106,0.16)",
    border: `1px solid ${COLORS.coral}`,
    borderRadius: 20,
    padding: "3px 10px",
    marginTop: 6,
    width: "fit-content",
  },
  badgeOkCard: {
    display: "inline-block",
    fontSize: 10,
    color: "#2f7a45",
    background: "rgba(63,168,90,0.14)",
    borderRadius: 20,
    padding: "3px 8px",
    marginBottom: 6,
    fontWeight: 600,
  },
  badgeUnknownCard: {
    display: "inline-block",
    fontSize: 10,
    color: "#8a6a1a",
    background: "rgba(232,196,104,0.22)",
    borderRadius: 20,
    padding: "3px 8px",
    marginBottom: 6,
    fontWeight: 600,
  },
  badgeFlaggedCard: {
    display: "inline-block",
    fontSize: 10,
    color: "#a8492b",
    background: "rgba(226,132,106,0.22)",
    borderRadius: 20,
    padding: "3px 8px",
    marginBottom: 6,
    fontWeight: 600,
  },
  ratingRow: { display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" },
  ratingRowHighlight: {},
  myRatingWrap: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  aggregateLine: { fontSize: 13, fontWeight: 600, color: COLORS.yellow },
  aggregateHiddenLine: { fontSize: 13, fontStyle: "italic", color: COLORS.chalkDim },
  ratingItem: { display: "flex", alignItems: "center", gap: 8 },
  ratingLabel: { fontSize: 13, color: COLORS.chalk, fontWeight: 600, minWidth: 0 },
  ratingLabelCard: { fontSize: 12, color: "#3a3320", fontWeight: 700, minWidth: 0 },
  ratingInput: {
    width: 64,
    height: 44,
    background: "#0c1810",
    border: `2px solid ${COLORS.yellow}`,
    borderRadius: 8,
    padding: "6px 8px",
    color: COLORS.yellow,
    fontSize: 20,
    fontWeight: 700,
    textAlign: "center",
  },
  ratingInputSmall: {
    width: 54,
    height: 38,
    background: "#fffdf6",
    border: `2px solid ${COLORS.coral}`,
    borderRadius: 8,
    padding: "4px 6px",
    color: "#a8492b",
    fontSize: 17,
    fontWeight: 700,
    textAlign: "center",
  },
  ratingOutOf: { fontSize: 12, color: COLORS.chalkDim, fontWeight: 600 },
  historySection: { marginTop: 8 },
  insightsSection: {
    marginTop: 8,
    marginBottom: 34,
    background: "rgba(0,0,0,0.15)",
    border: `1px solid ${COLORS.line}`,
    borderRadius: 20,
    padding: "20px 22px",
  },
  powerSection: {
    marginTop: 0,
    marginBottom: 22,
    background: "linear-gradient(160deg, rgba(232,196,104,0.10), rgba(0,0,0,0.15))",
    border: `1px solid ${COLORS.yellow}`,
    borderRadius: 20,
    padding: "20px 22px",
  },
  powerTitle: {
    fontFamily: "'Caveat', cursive",
    fontSize: 32,
    color: COLORS.yellow,
    margin: 0,
  },
  powerSubtitle: { fontSize: 12, color: COLORS.chalkDim, margin: "2px 0 14px" },
  tabBar: { display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 16px" },
  tabBtn: {
    background: "transparent",
    border: `1px solid ${COLORS.line}`,
    color: COLORS.chalkDim,
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  tabBtnActive: {
    background: COLORS.yellow,
    border: `1px solid ${COLORS.yellow}`,
    color: "#241a05",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  insightsList: { display: "flex", flexDirection: "column", gap: 8 },
  insightRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    flexWrap: "wrap",
    padding: "8px 10px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
  },
  insightWeekLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    color: COLORS.blue,
    minWidth: 110,
  },
  rankBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    color: COLORS.yellow,
    minWidth: 28,
  },
  insightSongTitle: { fontSize: 14, fontWeight: 700, color: COLORS.chalk },
  insightSongArtist: { fontSize: 12, color: COLORS.chalkDim },
  insightScore: { fontSize: 13, fontWeight: 700, color: COLORS.yellow, marginLeft: "auto" },
  thresholdRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  genreRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 2px" },
  genreBarTrack: {
    flex: 1,
    height: 10,
    background: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    overflow: "hidden",
  },
  genreBarFill: { height: "100%", background: COLORS.coral, borderRadius: 6 },
  genreCount: { fontSize: 11, color: COLORS.chalkDim },
  historyHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  historyTitle: { fontFamily: "'Caveat', cursive", fontSize: 30, color: COLORS.yellow, margin: 0 },
  filterBar: { display: "flex", gap: 8, flexWrap: "wrap" },
  emptyState: {
    textAlign: "center",
    color: COLORS.chalkDim,
    fontStyle: "italic",
    padding: "30px 0",
    fontSize: 14,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: 14,
  },
  card: {
    position: "relative",
    background: COLORS.chalk,
    color: "#241a05",
    borderRadius: 4,
    padding: "14px 14px 12px",
    boxShadow: "0 6px 14px rgba(0,0,0,0.35)",
    transform: "rotate(-0.6deg)",
  },
  deleteBtn: {
    position: "absolute",
    top: 6,
    right: 8,
    background: "transparent",
    border: "none",
    color: "#8a7f66",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
  },
  cardDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    color: "#8a7f66",
    marginBottom: 4,
  },
  cardTitle: { fontWeight: 700, fontSize: 15, lineHeight: 1.25 },
  cardArtist: { fontSize: 12, color: "#5c5340", marginTop: 2, marginBottom: 8 },
  cardTags: { display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" },
  tag: {
    fontSize: 10,
    background: "rgba(226,132,106,0.18)",
    color: "#a8492b",
    padding: "3px 8px",
    borderRadius: 20,
    fontWeight: 600,
  },
  tagAlt: {
    fontSize: 10,
    background: "rgba(127,176,186,0.22)",
    color: "#2c6270",
    padding: "3px 8px",
    borderRadius: 20,
    fontWeight: 600,
  },
  avgBadge: { fontSize: 13, fontWeight: 700, color: "#a8492b", marginBottom: 4 },
  footer: {
    textAlign: "center",
    fontSize: 11,
    color: COLORS.chalkDim,
    marginTop: 36,
    fontFamily: "'JetBrains Mono', monospace",
  },
};
