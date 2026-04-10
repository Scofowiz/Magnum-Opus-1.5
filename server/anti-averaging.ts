/**
 * Anti-Averaging Engine v2
 *
 * Prevents regression to mean by comparing output against
 * the user's own voice (via style fingerprint) rather than
 * generic "interesting word" lists.
 *
 * The goal: reject slop, enforce voice, gate quality.
 */

// StyleFingerprint interface (matches index.ts)
export interface StyleFingerprint {
  avgSentenceLength: number;
  dialogueRatio: number;
  passiveVoiceRatio: number;
  adverbDensity: number;
  vocabularyComplexity: number;
  toneDescriptor: string;
  showVsTellRatio: number;
  metaphorFrequency: number;
  strengths: string[];
  improvements: string[];
  signaturePhrases: string[];
  dialogueTags: {
    preferred: string[];
    avoided: string[];
  };
  verbChoices: {
    movement: string[];
    speech: string[];
    emotion: string[];
  };
  sentencePatterns: string[];
  sceneOpenings: string[];
  tensionTechniques: string[];
  humorStyle: string;
  emotionalPalette: string[];
  exemplars: string[];
  avoidances: string[];
  sampleCount: number;
}

// Risk tolerance levels
export type RiskTolerance = 'conservative' | 'moderate' | 'adventurous' | 'experimental';

export interface AntiAveragingConfig {
  riskTolerance: RiskTolerance;
  averagenessThreshold: number; // 0-1, reject above this
  regenerateOnFail: boolean;
  maxRegenerations: number;
}

export interface AveragenessReport {
  score: number; // 0-1, higher = more generic
  passed: boolean;
  violations: string[];
  suggestions: string[];
  metrics: {
    genericPhraseCount: number;
    predictableStructure: boolean;
    voiceMatchScore: number; // How well it matches user's fingerprint
    emotionalFlatness: number;
    dialogueTagViolations: string[];
  };
}

// Expanded generic phrase detection - these are the clichés that mark amateur writing
const GENERIC_PHRASES = [
  // Opening clichés
  'it was a dark and stormy night',
  'little did they know',
  'suddenly everything changed',
  'in a world where',
  'it all started when',

  // Emotional tells (telling not showing)
  'she felt a wave of',
  'he was filled with',
  'a sense of dread washed over',
  'tears streamed down',
  'heart pounding in chest',
  'blood ran cold',
  'stomach dropped',
  'couldn\'t believe eyes',

  // Action clichés
  'sprang into action',
  'time seemed to slow',
  'moved like lightning',
  'everything happened so fast',
  'in the blink of an eye',

  // Dialogue clichés
  'let out a breath didn\'t know was holding',
  'didn\'t realize was holding breath',
  'let out a sigh of relief',
  'couldn\'t find the words',
  'words caught in throat',

  // Romance clichés
  'their eyes met across the room',
  'electricity between them',
  'heart skipped a beat',
  'butterflies in stomach',
  'lost in eyes',
  'like no one else existed',

  // Description clichés
  'piercing blue eyes',
  'chiseled jaw',
  'curvaceous figure',
  'rippling muscles',
  'silky smooth',
  'crystal clear',

  // Ending clichés
  'and they lived happily ever after',
  'it was all just a dream',
  'everything would never be the same',
  'a new chapter was beginning',

  // Filler phrases
  'at the end of the day',
  'when all was said and done',
  'in the grand scheme of things',
  'needless to say',
  'it goes without saying',
];

// Weak dialogue tags to flag
const WEAK_DIALOGUE_TAGS = [
  'exclaimed', 'declared', 'announced', 'proclaimed',
  'queried', 'inquired', 'questioned',
  'retorted', 'replied', 'responded',
  'chortled', 'guffawed', 'giggled',
  'hissed', 'growled', 'snarled', 'barked',
  'breathed', 'whispered', // only weak when overused
];

// Adverb-laden dialogue patterns
const ADVERB_DIALOGUE_PATTERN = /[""][^""]+[""],?\s+\w+\s+said\s+(\w+ly)/gi;
const SAID_ALTERNATIVES_PATTERN = /[""][^""]+[""],?\s+\w+\s+(exclaimed|declared|announced|proclaimed|queried|inquired|retorted|chortled|guffawed|hissed|growled|snarled|barked)/gi;

export class AntiAveragingEngine {

  /**
   * Analyze text for averageness, comparing against user's voice
   */
  analyze(
    text: string,
    fingerprint: StyleFingerprint | null,
    config: AntiAveragingConfig
  ): AveragenessReport {

    const violations: string[] = [];
    const suggestions: string[] = [];
    let score = 0;

    // 1. Generic phrase detection
    const genericPhraseCount = this.countGenericPhrases(text);
    if (genericPhraseCount > 0) {
      score += Math.min(genericPhraseCount * 0.1, 0.3);
      violations.push(`${genericPhraseCount} generic phrase(s) detected`);
      suggestions.push('Replace clichéd phrases with specific, concrete details');
    }

    // 2. Predictable structure detection
    const predictableStructure = this.hasPredictableStructure(text);
    if (predictableStructure) {
      score += 0.15;
      violations.push('Predictable sentence rhythm detected');
      suggestions.push('Vary sentence length - mix short punches with longer builds');
    }

    // 3. Dialogue tag violations
    const dialogueTagViolations = this.findDialogueTagViolations(text, fingerprint);
    if (dialogueTagViolations.length > 0) {
      score += Math.min(dialogueTagViolations.length * 0.05, 0.2);
      violations.push(`Weak dialogue tags: ${dialogueTagViolations.slice(0, 3).join(', ')}`);
      suggestions.push('Use action beats instead of adverb-laden tags');
    }

    // 4. Voice match (if fingerprint available)
    let voiceMatchScore = 0.5; // neutral if no fingerprint
    if (fingerprint) {
      voiceMatchScore = this.calculateVoiceMatch(text, fingerprint);
      if (voiceMatchScore < 0.4) {
        score += 0.2;
        violations.push('Output doesn\'t match author\'s established voice');
        suggestions.push('Review signature phrases and rhythm patterns');
      }
    }

    // 5. Emotional flatness (too much telling)
    const emotionalFlatness = this.measureEmotionalFlatness(text);
    if (emotionalFlatness > 0.6) {
      score += 0.15;
      violations.push('Emotional telling instead of showing');
      suggestions.push('Show emotion through action, dialogue, and sensory detail');
    }

    // 6. Check for AI-typical patterns
    const aiPatterns = this.detectAIPatterns(text);
    if (aiPatterns.length > 0) {
      score += Math.min(aiPatterns.length * 0.1, 0.25);
      violations.push(`AI-typical patterns: ${aiPatterns.join(', ')}`);
      suggestions.push('Break predictable AI phrasing patterns');
    }

    // Normalize score
    score = Math.min(score, 1.0);

    return {
      score,
      passed: score <= config.averagenessThreshold,
      violations,
      suggestions,
      metrics: {
        genericPhraseCount,
        predictableStructure,
        voiceMatchScore,
        emotionalFlatness,
        dialogueTagViolations,
      },
    };
  }

  /**
   * Generate prompt injection to prevent averaging
   */
  generatePromptDirectives(
    fingerprint: StyleFingerprint | null,
    config: AntiAveragingConfig
  ): string {
    const parts: string[] = [];

    parts.push('## ANTI-AVERAGING DIRECTIVES');
    parts.push('');

    // Risk-based creativity instructions
    switch (config.riskTolerance) {
      case 'experimental':
        parts.push('CREATIVITY LEVEL: EXPERIMENTAL');
        parts.push('- Break narrative conventions when it serves the story');
        parts.push('- Use unexpected structural choices');
        parts.push('- Take risks with voice and perspective');
        parts.push('- Surprise the reader without confusing them');
        break;
      case 'adventurous':
        parts.push('CREATIVITY LEVEL: ADVENTUROUS');
        parts.push('- Push beyond safe choices');
        parts.push('- Use unexpected metaphors and imagery');
        parts.push('- Vary pacing dramatically');
        parts.push('- Let characters surprise themselves');
        break;
      case 'moderate':
        parts.push('CREATIVITY LEVEL: MODERATE');
        parts.push('- Favor vivid specifics over generic descriptions');
        parts.push('- Add subtle unexpected elements');
        parts.push('- Strengthen distinctive voice markers');
        break;
      case 'conservative':
        parts.push('CREATIVITY LEVEL: POLISHED');
        parts.push('- Focus on precise word choices');
        parts.push('- Deepen emotional resonance');
        parts.push('- Enhance sensory grounding');
        break;
    }

    parts.push('');
    parts.push('ABSOLUTE PROHIBITIONS:');
    parts.push('- NO clichéd openings ("It was a dark and stormy night", "Little did they know")');
    parts.push('- NO emotional telling ("She felt sad", "He was angry") - SHOW through action');
    parts.push('- NO adverb-laden dialogue tags ("said angrily", "whispered softly")');
    parts.push('- NO generic descriptions ("piercing blue eyes", "chiseled jaw")');
    parts.push('- NO filler phrases ("at the end of the day", "needless to say")');
    parts.push('');

    // Add fingerprint-specific directives
    if (fingerprint) {
      parts.push('VOICE ENFORCEMENT:');

      if (fingerprint.dialogueTags?.avoided?.length) {
        parts.push(`- NEVER use these dialogue approaches: ${fingerprint.dialogueTags.avoided.join(', ')}`);
      }

      if (fingerprint.avoidances?.length) {
        parts.push(`- Author specifically avoids: ${fingerprint.avoidances.join(', ')}`);
      }

      parts.push('');
    }

    parts.push('QUALITY STANDARD: This output will be compared against published literary fiction.');
    parts.push('Generic prose will be rejected and regenerated.');
    parts.push('');

    return parts.join('\n');
  }

  /**
   * Count generic/clichéd phrases in text
   */
  private countGenericPhrases(text: string): number {
    const lowerText = text.toLowerCase();
    let count = 0;

    for (const phrase of GENERIC_PHRASES) {
      if (lowerText.includes(phrase)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check for predictable sentence structure
   */
  private hasPredictableStructure(text: string): boolean {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length < 5) return false;

    const lengths = sentences.map(s => s.split(/\s+/).length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    // Calculate variance
    const variance = lengths.reduce((sum, len) =>
      sum + Math.pow(len - avgLength, 2), 0) / lengths.length;

    // Low variance = predictable rhythm
    // Also check for repetitive patterns
    let patternCount = 0;
    for (let i = 0; i < lengths.length - 2; i++) {
      const pattern = lengths.slice(i, i + 3).map(l =>
        l < 10 ? 'S' : l < 20 ? 'M' : 'L'
      ).join('');

      // Count how often this pattern repeats
      for (let j = i + 1; j < lengths.length - 2; j++) {
        const compare = lengths.slice(j, j + 3).map(l =>
          l < 10 ? 'S' : l < 20 ? 'M' : 'L'
        ).join('');
        if (pattern === compare) patternCount++;
      }
    }

    return variance < 150 || patternCount > sentences.length * 0.3;
  }

  /**
   * Find dialogue tag violations
   */
  private findDialogueTagViolations(
    text: string,
    fingerprint: StyleFingerprint | null
  ): string[] {
    const violations: string[] = [];

    // Find adverb + said patterns
    const adverbMatches = [...text.matchAll(ADVERB_DIALOGUE_PATTERN)];
    for (const match of adverbMatches) {
      violations.push(`"said ${match[1]}"`);
    }

    // Find weak said alternatives
    const altMatches = [...text.matchAll(SAID_ALTERNATIVES_PATTERN)];
    for (const match of altMatches) {
      // Check if this is in the user's avoided list
      if (fingerprint?.dialogueTags?.avoided?.includes(match[1])) {
        violations.push(`"${match[1]}" (author avoids this)`);
      } else if (WEAK_DIALOGUE_TAGS.includes(match[1].toLowerCase())) {
        violations.push(`"${match[1]}"`);
      }
    }

    return violations;
  }

  /**
   * Calculate how well text matches user's voice fingerprint
   */
  private calculateVoiceMatch(text: string, fingerprint: StyleFingerprint): number {
    let matchScore = 0;
    let checks = 0;

    // Check sentence length alignment
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgLength = sentences.reduce((sum, s) =>
      sum + s.split(/\s+/).length, 0) / Math.max(sentences.length, 1);

    if (fingerprint.avgSentenceLength) {
      const lengthDiff = Math.abs(avgLength - fingerprint.avgSentenceLength);
      matchScore += lengthDiff < 5 ? 1 : lengthDiff < 10 ? 0.5 : 0;
      checks++;
    }

    // Check for signature phrase patterns (not exact matches, but similar constructions)
    if (fingerprint.signaturePhrases?.length) {
      // Look for structural similarity rather than exact matches
      const hasSignatureStyle = fingerprint.signaturePhrases.some((phrase: string) => {
        // Check if the text uses similar constructions
        const pattern = this.extractPattern(phrase);
        return pattern && text.toLowerCase().includes(pattern);
      });
      matchScore += hasSignatureStyle ? 1 : 0.3;
      checks++;
    }

    // Check dialogue style alignment
    if (fingerprint.dialogueTags?.preferred?.length) {
      const preferredTags = fingerprint.dialogueTags.preferred;
      const usesPreferred = preferredTags.some((tag: string) =>
        text.toLowerCase().includes(tag.toLowerCase())
      );
      matchScore += usesPreferred ? 1 : 0.5;
      checks++;
    }

    // Check vocabulary complexity alignment
    if (fingerprint.vocabularyComplexity !== undefined) {
      const words = text.split(/\s+/);
      const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
      const textComplexity = Math.min(1, (avgWordLength - 3) / 5);
      const complexityDiff = Math.abs(textComplexity - fingerprint.vocabularyComplexity);
      matchScore += complexityDiff < 0.2 ? 1 : complexityDiff < 0.4 ? 0.5 : 0;
      checks++;
    }

    return checks > 0 ? matchScore / checks : 0.5;
  }

  /**
   * Extract a generalizable pattern from a signature phrase
   */
  private extractPattern(phrase: string): string | null {
    // Extract the structural pattern, not the specific words
    // e.g., "the X of Y" or "verb-noun-verb" patterns
    const lower = phrase.toLowerCase();

    // Common structural patterns to look for
    if (lower.includes(' like ')) return ' like ';
    if (lower.includes(' as if ')) return ' as if ';
    if (lower.includes(' as though ')) return ' as though ';
    if (lower.includes('—')) return '—'; // em-dash usage
    if (lower.includes(';')) return ';'; // semicolon usage

    return null;
  }

  /**
   * Measure emotional flatness (telling vs showing)
   */
  private measureEmotionalFlatness(text: string): number {
    const lower = text.toLowerCase();

    // Telling phrases (bad)
    const tellingPhrases = [
      'felt angry', 'felt sad', 'felt happy', 'felt scared',
      'was angry', 'was sad', 'was happy', 'was scared',
      'felt a surge of', 'felt a wave of', 'felt overcome by',
      'filled with anger', 'filled with sadness', 'filled with joy',
      'suddenly felt', 'began to feel', 'couldn\'t help but feel',
    ];

    let tellingCount = 0;
    for (const phrase of tellingPhrases) {
      const regex = new RegExp(phrase, 'gi');
      const matches = lower.match(regex);
      if (matches) tellingCount += matches.length;
    }

    // Showing indicators (good)
    const showingIndicators = [
      'clenched', 'trembled', 'flushed', 'paled',
      'jaw tightened', 'fists balled', 'shoulders hunched',
      'voice cracked', 'hands shook', 'breath caught',
    ];

    let showingCount = 0;
    for (const indicator of showingIndicators) {
      if (lower.includes(indicator)) showingCount++;
    }

    // Calculate ratio
    const total = tellingCount + showingCount;
    if (total === 0) return 0.5; // neutral

    return tellingCount / total;
  }

  /**
   * Detect AI-typical patterns
   */
  private detectAIPatterns(text: string): string[] {
    const patterns: string[] = [];
    const lower = text.toLowerCase();

    // AI loves these transitional phrases
    const aiTransitions = [
      'it\'s worth noting that',
      'it\'s important to note',
      'interestingly enough',
      'as it turns out',
      'in this moment',
      'couldn\'t help but notice',
      'found themselves',
      'made their way',
    ];

    for (const phrase of aiTransitions) {
      if (lower.includes(phrase)) {
        patterns.push(`"${phrase}"`);
      }
    }

    // AI often over-explains with parenthetical asides
    const parentheticalCount = (text.match(/—[^—]+—/g) || []).length;
    if (parentheticalCount > text.length / 500) {
      patterns.push('excessive parenthetical asides');
    }

    // AI loves starting sentences with "The"
    const sentences = text.split(/[.!?]+/);
    const theStarts = sentences.filter(s => s.trim().toLowerCase().startsWith('the ')).length;
    if (theStarts > sentences.length * 0.4) {
      patterns.push('repetitive "The..." sentence openings');
    }

    return patterns;
  }
}

// Singleton instance
export const antiAveraging = new AntiAveragingEngine();

// Default config
export const DEFAULT_ANTI_AVERAGING_CONFIG: AntiAveragingConfig = {
  riskTolerance: 'moderate',
  averagenessThreshold: 0.5,
  regenerateOnFail: true,
  maxRegenerations: 2,
};
