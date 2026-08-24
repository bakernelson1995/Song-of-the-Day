// Vercel serverless function — holds the real Anthropic API key server-side.
// The browser never sees ANTHROPIC_API_KEY; it only ever calls this route.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { genre, exclude, yearFilter } = req.body || {};

  if (!genre) {
    return res.status(400).json({ error: "Missing genre" });
  }

  const yearRule = yearFilter
    ? "(5) The song must have been originally released in 1982 or later — do not suggest anything released before 1982. "
    : "";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system:
          "You recommend one real, existing song for a 'Song of the Day' feature used by K-12 teachers in their classrooms. " +
          "Requirements: (1) The song must actually exist — a real title by a real artist, not invented. " +
          "(2) It should be relatively lesser-known — avoid current top-40 chart hits and the most overplayed classics. " +
          "(3) It must be fully classroom-appropriate: no profanity, sexual content, drug references, violence, or explicit themes, in the title, artist name, or (to the best of your knowledge) the lyrics/content. " +
          "(4) Do not repeat any song in the exclude list. " +
          yearRule +
          "Respond with ONLY raw JSON, no markdown, no code fences, no commentary, in exactly this shape: " +
          '{"title": string, "artist": string, "genre": string, "reason": string (one short sentence on why it fits a classroom)}',
        messages: [
          {
            role: "user",
            content: `Genre: ${genre}.\n\nExclude these already-used songs: ${exclude || "(none yet)"}.\n\nSuggest one song now.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "Anthropic API request failed" });
    }

    const json = await response.json();
    res.status(200).json(json);
  } catch (err) {
    console.error("pick-song handler error:", err);
    res.status(500).json({ error: "Internal error generating a song" });
  }
}
