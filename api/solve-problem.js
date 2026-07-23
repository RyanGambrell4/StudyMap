import { verifyAndCheckAiUsage } from '../lib/server/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const gate = await verifyAndCheckAiUsage(req)
  if (!gate.ok) return res.status(gate.status).json({ error: gate.error, usage: gate.usage })

  const {
    problem,
    imageBase64,
    mediaType,
    subject,
    // Wave 2 additions:
    mode = 'solution',            // 'solution' | 'socratic' | 'diagnose'
    studentWorkImage,             // base64 of the student's own work
    studentWorkMediaType,
    priorHints = [],              // for socratic: hints already shown
    lastStudentReply = null,      // socratic: what the student typed as the next step
  } = req.body
  if (!problem?.trim() && !imageBase64 && !studentWorkImage) {
    return res.status(400).json({ error: 'Problem text, problem image, or work image required' })
  }

  const modeConfig = MODE_CONFIG[mode] ?? MODE_CONFIG.solution
  const systemPrompt = modeConfig.system

  const userContent = []
  if (imageBase64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
    })
    userContent.push({ type: 'text', text: 'Above is the problem statement (as an image).' })
  }
  if (studentWorkImage) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: studentWorkMediaType || 'image/jpeg', data: studentWorkImage }
    })
    userContent.push({ type: 'text', text: 'Above is the STUDENT\'S own attempt at solving the problem. Diagnose where THEY went wrong, not just what the correct path is.' })
  }
  userContent.push({
    type: 'text',
    text: modeConfig.instructions({ problem, subject, priorHints, lastStudentReply, hasWorkImage: !!studentWorkImage }),
  })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: mode === 'socratic' ? 900 : 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(500).json({ error: 'AI service error: ' + err })
  }

  const data = await response.json()
  const raw = data.content?.[0]?.text || ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return res.status(500).json({ error: 'Failed to parse AI response' })

  let result
  try {
    result = JSON.parse(jsonMatch[0])
  } catch {
    return res.status(500).json({ error: 'Invalid JSON from AI' })
  }

  // Preserve the existing 'solution' shape so existing callers don't break.
  if (mode === 'solution') return res.status(200).json({ solution: result, mode })
  return res.status(200).json({ ...result, mode })
}

const MODE_CONFIG = {
  solution: {
    system: `You are an expert STEM tutor who solves problems with clear, educational step-by-step explanations. Always return valid JSON matching the exact schema requested. Show your work in a way that helps students understand the reasoning, not just the answer.`,
    instructions: ({ problem, subject }) => `Solve this ${subject ? subject + ' ' : ''}problem step by step.${problem?.trim() ? '\n\nProblem: ' + problem.trim() : ''}

Return ONLY a JSON object with this exact structure:
{
  "subject": "detected subject (Math, Physics, Chemistry, Biology, etc.)",
  "restatedProblem": "restate the problem clearly in one sentence",
  "approach": "brief description of the method/strategy to use",
  "steps": [
    {
      "number": 1,
      "action": "what we do in this step",
      "work": "the actual math/logic/working shown here",
      "note": "optional insight or tip (empty string if none)"
    }
  ],
  "finalAnswer": "the complete final answer with units if applicable",
  "keyFormulas": ["formula1", "formula2"],
  "difficulty": "Easy | Medium | Hard",
  "commonMistake": "one common mistake students make on this type of problem"
}

No em dashes in any field.`,
  },

  socratic: {
    system: `You are a Socratic tutor. You DO NOT give the answer or the full solution. You ask ONE guiding question at a time, targeted at the NEXT step the student needs to reason through. You react to what they say, correcting gently if wrong, confirming and advancing if right. Your goal is that they solve the problem themselves.`,
    instructions: ({ problem, subject, priorHints, lastStudentReply }) => {
      const priorBlock = priorHints.length
        ? `HINTS ALREADY SHOWN (do NOT repeat these):\n${priorHints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
        : 'This is the FIRST hint. Anchor with the concept the student needs to apply first.'
      const replyBlock = lastStudentReply
        ? `STUDENT'S LATEST ATTEMPT AT THE NEXT STEP: "${lastStudentReply}"`
        : 'The student has not tried anything yet.'

      return `${subject ? `Subject: ${subject}\n` : ''}Problem: ${problem?.trim() ?? '(see image above)'}

${priorBlock}

${replyBlock}

Return ONLY a JSON object:
{
  "reactToReply": "one sentence reacting to their latest attempt. Be encouraging when right, gentle-but-clear when wrong. Empty string if there was no attempt yet.",
  "wasReplyCorrect": true | false | null,
  "nextHint": "ONE guiding question that points them to the NEXT concept/formula/manipulation. NEVER the full answer to the current step.",
  "expectedResponseShape": "one short phrase describing what a correct answer to this hint looks like, e.g. 'a formula involving F=ma' or 'a value in mol/L'",
  "atFinalStep": true | false,
  "finalAnswerReveal": "only fill this in when atFinalStep is true AND the student's reply IS the final answer. Otherwise empty string."
}

Rules:
- NEVER include the full solution.
- Each nextHint moves EXACTLY one conceptual step forward.
- If the student is stuck, break the current step into an even smaller sub-question — don't just repeat.
- No em dashes anywhere.`
    },
  },

  diagnose: {
    system: `You are a math/science tutor diagnosing where a specific student's own work went wrong. You've been shown their handwritten or typed attempt. Your job is to identify the FIRST place they made a mistake, name it precisely, and give them the smallest possible push to fix it themselves.`,
    instructions: ({ problem, subject, hasWorkImage }) => `${subject ? `Subject: ${subject}\n` : ''}Problem: ${problem?.trim() ?? '(see image above)'}

${hasWorkImage
  ? 'The student\'s own attempt is attached as an image above. Read it carefully.'
  : 'The student\'s attempt should have been attached but is missing. Say so in "missingWorkImage".'
}

Return ONLY a JSON object:
{
  "missingWorkImage": false,
  "restatedProblem": "one sentence",
  "firstWrongStep": "which step number/line of their work is the FIRST error",
  "misstepType": "arithmetic | sign_error | formula_choice | substitution | algebra | conceptual | units | domain",
  "whatTheyDid": "quote or paraphrase what they wrote at that step",
  "whyItsWrong": "one sentence explaining why that step doesn't work",
  "smallPush": "one guiding question or hint that lets THEM fix it, not the fixed value",
  "wouldFinalAnswerBe": "the final answer they'd get if they fix that step (in case they want confirmation)",
  "correctPathFromHere": [
    { "number": 1, "action": "…", "work": "…" }
  ]
}

No em dashes anywhere.`,
  },
}
