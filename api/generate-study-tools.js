export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text || text.length < 50) {
    return res.status(400).json({ error: 'Not enough text content' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `You are an expert academic tutor. Based on these lecture notes/slides, generate study materials as JSON.

Content:
${text.slice(0, 8000)}

Generate exactly this JSON structure with no extra text:
{
  "flashcards": [
    {"front": "clear question about a key concept", "back": "complete educational answer in 2-3 sentences", "topic": "topic name"}
  ],
  "quiz": [
    {"question": "question text", "type": "multiple_choice", "options": ["A", "B", "C", "D"], "answer": "correct option text", "explanation": "why this is correct"}
  ]
}

Rules:
- Generate 15 flashcards testing real concepts, definitions, and formulas
- Generate 10 quiz questions
- Flashcard fronts must be complete questions like "What is market capitalization?" not single words
- Flashcard backs must be educational explanations, not fragments
- Quiz wrong answers must be plausible but clearly wrong if you know the material
- Never use single words like "Investors" or "What" as a flashcard front
- Focus on concepts students will actually be tested on`
        }]
      })
    });

    const data = await response.json();
    const content = data.content[0].text
    const firstBrace = content.indexOf('{')
    const lastBrace = content.lastIndexOf('}')
    const cleaned = content.slice(firstBrace, lastBrace + 1)
    const parsed = JSON.parse(cleaned)

    // Shuffle quiz options so correct answer is evenly distributed across positions
    if (parsed.quiz) {
      parsed.quiz = parsed.quiz.map(q => {
        const opts = [...q.options]
        for (let i = opts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [opts[i], opts[j]] = [opts[j], opts[i]]
        }
        return { ...q, options: opts }
      })
    }

    res.status(200).json(parsed);
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
}
