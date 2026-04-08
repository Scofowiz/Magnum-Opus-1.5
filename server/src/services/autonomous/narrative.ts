import type { NarrativeState } from "../../domain/types.js";

interface NarrativeChatResult {
  text: string;
  tokens: number;
}

interface NarrativeDeps {
  chatCompletion(
    systemPrompt: string,
    userMessage: string,
    options?: {
      maxTokens?: number;
      temperature?: number;
      signal?: AbortSignal;
    },
  ): Promise<NarrativeChatResult>;
  tokenLimits: {
    NARRATIVE_STATE: { input: number; output: number };
    POLISH_TEXT: { input: number; output: number };
  };
}

const DEFAULT_NARRATIVE_STATE: NarrativeState = {
  time: "unknown",
  location: "unknown",
  povCharacter: "unknown",
  mood: "neutral",
};

export function createNarrativeService(deps: NarrativeDeps): {
  extractNarrativeState: (
    recentText: string,
    signal?: AbortSignal,
  ) => Promise<NarrativeState>;
  polishText: (
    text: string,
    narrativeState: NarrativeState,
    contextBefore: string,
    signal?: AbortSignal,
  ) => Promise<string>;
} {
  async function extractNarrativeState(
    recentText: string,
    signal?: AbortSignal,
  ): Promise<NarrativeState> {
    try {
      const { text } = await deps.chatCompletion(
        "You are a narrative analyst. Extract the current state from the text. Respond only with valid JSON.",
        `From this text, extract the current narrative state.

TEXT (last portion):
${recentText.slice(-deps.tokenLimits.NARRATIVE_STATE.input)}

Return JSON:
{
  "time": "time of day/period mentioned (e.g., '7pm', 'evening', 'next morning', 'unknown')",
  "location": "current scene location",
  "povCharacter": "who the narrative is currently following",
  "mood": "current emotional tone of the scene"
}

Return ONLY JSON.`,
        { maxTokens: deps.tokenLimits.NARRATIVE_STATE.output, signal },
      );

      return JSON.parse(text) as NarrativeState;
    } catch (error) {
      if (error instanceof Error && error.message === "Aborted") {
        throw error;
      }
      return DEFAULT_NARRATIVE_STATE;
    }
  }

  async function polishText(
    text: string,
    narrativeState: NarrativeState,
    contextBefore: string,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      const { text: polished } = await deps.chatCompletion(
        "You are a continuity editor. Make the smallest possible edits for continuity while preserving the content and voice. Do not invent new scenes, time jumps, characters, or reveals.",
        `Review and polish this generated text for continuity.

CURRENT NARRATIVE STATE (must be maintained or transitioned smoothly):
- Time: ${narrativeState.time}
- Location: ${narrativeState.location}
- POV Character: ${narrativeState.povCharacter}
- Mood: ${narrativeState.mood}

CONTEXT BEFORE (for continuity):
${contextBefore.slice(-deps.tokenLimits.POLISH_TEXT.input)}

TEXT TO POLISH:
${text}

RULES:
1. Do not invent time jumps such as "Hours later", "By the time", blackouts, waking up elsewhere, or other scene resets unless the source text already clearly implies them.
2. If location changes abruptly, only add the smallest clarifying bridge already supported by the source text.
3. Maintain consistent POV - don't head-hop
4. Keep the same voice and style
5. Remove duplicated paragraphs, repeated dialogue exchanges, and replayed questions/answers
6. Do not paper over a bad reset by inventing a new blackout, waking-up beat, or vague "hours later" jump unless the text already truly earned it
7. Don't add new plot, antagonists, traps, security events, or discoveries
8. Prefer deleting or lightly rephrasing over adding new material
9. If the text is already smooth, return it unchanged

Return ONLY the polished text, nothing else.`,
        {
          maxTokens: deps.tokenLimits.POLISH_TEXT.output,
          temperature: 0.6,
          signal,
        },
      );

      return polished;
    } catch (error) {
      if (error instanceof Error && error.message === "Aborted") {
        throw error;
      }
      return text;
    }
  }

  return {
    extractNarrativeState,
    polishText,
  };
}
