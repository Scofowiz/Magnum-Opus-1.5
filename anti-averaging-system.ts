/**
 * Anti-Averaging System - Prevents regression to mean
 *
 * Fights against the natural tendency of AI systems to produce
 * safe, average, predictable content by actively encouraging
 * creative risks and distinctive voice.
 */

import { z } from "zod";

// Creative risk assessment
export const CreativeRiskAssessmentSchema = z.object({
  riskLevel: z.enum(["safe", "moderate", "bold", "experimental"]),
  riskFactors: z.array(z.string()),
  potentialPayoff: z.number().min(0).max(10),
  userToleranceMatch: z.boolean(),
  reasoning: z.string(),
});
export type CreativeRiskAssessment = z.infer<
  typeof CreativeRiskAssessmentSchema
>;

// Anti-averaging configuration
export const AntiAveragingConfigSchema = z.object({
  userId: z.string(),
  creativityBias: z.number().min(0).max(2), // 1.0 = neutral, >1.0 = favor creativity
  surpriseFactorTarget: z.number().min(0).max(1), // How much surprise to aim for
  riskTolerance: z.enum([
    "conservative",
    "moderate",
    "adventurous",
    "experimental",
  ]),
  preferredUnexpectedElements: z.array(z.string()),
  avoidedRisks: z.array(z.string()),
  lastUpdated: z.date(),
});
export type AntiAveragingConfig = z.infer<typeof AntiAveragingConfigSchema>;

/**
 * Anti-Averaging Engine
 */
export class AntiAveragingEngine {
  /**
   * Analyze if content is too "safe" or predictable
   */
  analyzeAverageness(
    text: string,
    _context?: string,
  ): {
    averagenessScore: number; // 0-1, higher = more average/predictable
    averageElements: string[];
    opportunities: string[];
  } {
    const averageElements: string[] = [];
    const opportunities: string[] = [];
    let averagenessScore = 0;

    // Check for generic phrases
    const genericPhrases = [
      "at the end of the day",
      "it was a dark and stormy night",
      "little did they know",
      "suddenly everything changed",
      "their eyes met across the room",
      "time seemed to stand still",
    ];

    genericPhrases.forEach((phrase) => {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        averageElements.push(`Generic phrase: "${phrase}"`);
        averagenessScore += 0.2;
      }
    });

    // Check for predictable structure
    if (this.hasPredictableStructure(text)) {
      averageElements.push("Predictable narrative structure");
      averagenessScore += 0.3;
      opportunities.push("Try unexpected narrative structure or pacing");
    }

    // Check for safe word choices
    const riskWords = this.countRiskyWords(text);
    if (riskWords < text.split(" ").length * 0.05) {
      // Less than 5% interesting words
      averageElements.push("Safe, conventional word choices");
      averagenessScore += 0.2;
      opportunities.push("Use more vivid, unexpected vocabulary");
    }

    // Check for emotional range
    const emotionalRange = this.analyzeEmotionalRange(text);
    if (emotionalRange < 0.3) {
      averageElements.push("Limited emotional range");
      averagenessScore += 0.2;
      opportunities.push("Explore wider emotional spectrum");
    }

    // Check for creative imagery
    if (!this.hasCreativeImagery(text)) {
      averageElements.push("Conventional imagery");
      averagenessScore += 0.1;
      opportunities.push("Add unexpected metaphors or imagery");
    }

    return {
      averagenessScore: Math.min(averagenessScore, 1.0),
      averageElements,
      opportunities,
    };
  }

  /**
   * Generate creative enhancement suggestions
   */
  generateCreativeEnhancements(
    text: string,
    config: AntiAveragingConfig,
  ): {
    suggestions: string[];
    riskLevel: string;
    reasoning: string[];
  } {
    const suggestions: string[] = [];
    const reasoning: string[] = [];

    const averageAnalysis = this.analyzeAverageness(text);

    if (averageAnalysis.averagenessScore > 0.5) {
      reasoning.push(
        `Text scores ${(averageAnalysis.averagenessScore * 100).toFixed(0)}% on predictability - targeting creative enhancement`,
      );

      // Suggest specific improvements based on user's risk tolerance
      switch (config.riskTolerance) {
        case "experimental":
          suggestions.push("Break narrative conventions completely");
          suggestions.push(
            "Use stream-of-consciousness or fragmented structure",
          );
          suggestions.push("Experiment with voice and perspective shifts");
          break;

        case "adventurous":
          suggestions.push("Add unexpected metaphors or imagery");
          suggestions.push("Introduce surprising character motivations");
          suggestions.push("Play with unconventional pacing");
          break;

        case "moderate":
          suggestions.push("Enhance with more vivid, specific details");
          suggestions.push("Add subtle unexpected elements");
          suggestions.push("Strengthen unique voice characteristics");
          break;

        case "conservative":
          suggestions.push("Polish word choices for more precision");
          suggestions.push("Add depth to emotional moments");
          suggestions.push("Enhance sensory details");
          break;
      }
    }

    return {
      suggestions,
      riskLevel: config.riskTolerance,
      reasoning,
    };
  }

  /**
   * Creative risk assessment
   */
  assessCreativeRisk(
    originalText: string,
    enhancedText: string,
    userConfig: AntiAveragingConfig,
  ): CreativeRiskAssessment {
    const riskFactors: string[] = [];
    let riskLevel: "safe" | "moderate" | "bold" | "experimental" = "safe";
    let potentialPayoff = 5;

    // Analyze changes made
    const lengthChange = enhancedText.length / originalText.length;
    const wordChoiceRisk = this.analyzeWordChoiceRisk(
      originalText,
      enhancedText,
    );
    const structuralRisk = this.analyzeStructuralRisk(
      originalText,
      enhancedText,
    );

    // Assess length changes
    if (lengthChange > 2.0) {
      riskFactors.push("Significant expansion");
      riskLevel = "moderate";
      potentialPayoff += 1;
    }

    // Assess word choice creativity
    if (wordChoiceRisk > 0.3) {
      riskFactors.push("Creative vocabulary choices");
      riskLevel = "bold";
      potentialPayoff += 2;
    }

    // Assess structural changes
    if (structuralRisk > 0.2) {
      riskFactors.push("Unconventional structure");
      riskLevel = "experimental";
      potentialPayoff += 3;
    }

    // Check user tolerance
    const userToleranceMatch = this.matchesUserTolerance(
      riskLevel,
      userConfig.riskTolerance,
    );

    return {
      riskLevel,
      riskFactors,
      potentialPayoff: Math.min(potentialPayoff, 10),
      userToleranceMatch,
      reasoning: `Risk level: ${riskLevel}. Factors: ${riskFactors.join(", ")}`,
    };
  }

  /**
   * Check for predictable structure
   */
  private hasPredictableStructure(text: string): boolean {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    if (sentences.length < 3) return false;

    // Check for very similar sentence lengths (predictable rhythm)
    const lengths = sentences.map((s) => s.length);
    const avgLength =
      lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const variance =
      lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) /
      lengths.length;

    // Low variance suggests predictable structure
    return variance < 200;
  }

  /**
   * Count risky/interesting words
   */
  private countRiskyWords(text: string): number {
    const interestingWords = [
      "shattered",
      "whispered",
      "trembled",
      "crystalline",
      "ephemeral",
      "labyrinthine",
      "kaleidoscope",
      "melancholy",
      "ethereal",
      "haunting",
      "visceral",
      "raw",
      "jagged",
      "luminous",
      "fractured",
      "gossamer",
    ];

    const words = text.toLowerCase().split(/\s+/);
    return words.filter((word) =>
      interestingWords.some((interesting) => word.includes(interesting)),
    ).length;
  }

  /**
   * Analyze emotional range
   */
  private analyzeEmotionalRange(text: string): number {
    const emotionWords = {
      joy: ["joy", "happiness", "delight", "elation", "bliss"],
      sadness: ["sadness", "sorrow", "grief", "melancholy", "despair"],
      anger: ["anger", "rage", "fury", "irritation", "wrath"],
      fear: ["fear", "terror", "anxiety", "dread", "panic"],
      surprise: ["surprise", "astonishment", "wonder", "amazement"],
      disgust: ["disgust", "revulsion", "contempt", "loathing"],
    };

    const lowerText = text.toLowerCase();
    const emotionsPresent = Object.values(emotionWords).filter((emotions) =>
      emotions.some((emotion) => lowerText.includes(emotion)),
    ).length;

    return emotionsPresent / Object.keys(emotionWords).length;
  }

  /**
   * Check for creative imagery
   */
  private hasCreativeImagery(text: string): boolean {
    const creativeIndicators = [
      "like",
      "as if",
      "resembled",
      "seemed to",
      "metaphor",
      "shimmered",
      "danced",
      "whispered",
      "sang",
      "painted",
    ];

    const lowerText = text.toLowerCase();
    return creativeIndicators.some((indicator) =>
      lowerText.includes(indicator),
    );
  }

  /**
   * Analyze word choice risk
   */
  private analyzeWordChoiceRisk(original: string, enhanced: string): number {
    const originalWords = new Set(original.toLowerCase().split(/\s+/));
    const enhancedWords = new Set(enhanced.toLowerCase().split(/\s+/));

    const newWords = [...enhancedWords].filter(
      (word) => !originalWords.has(word),
    );
    const complexWords = newWords.filter((word) => word.length > 7).length;

    return complexWords / enhanced.split(/\s+/).length;
  }

  /**
   * Analyze structural risk
   */
  private analyzeStructuralRisk(original: string, enhanced: string): number {
    const originalSentences = original.split(/[.!?]+/).length;
    const enhancedSentences = enhanced.split(/[.!?]+/).length;

    const structureChange =
      Math.abs(enhancedSentences - originalSentences) / originalSentences;
    return Math.min(structureChange, 1.0);
  }

  /**
   * Check if risk level matches user tolerance
   */
  private matchesUserTolerance(
    riskLevel: "safe" | "moderate" | "bold" | "experimental",
    userTolerance: "conservative" | "moderate" | "adventurous" | "experimental",
  ): boolean {
    const riskMap = {
      safe: 1,
      moderate: 2,
      bold: 3,
      experimental: 4,
    };

    const toleranceMap = {
      conservative: 2,
      moderate: 3,
      adventurous: 4,
      experimental: 5,
    };

    return riskMap[riskLevel] <= toleranceMap[userTolerance];
  }
}

/**
 * Creative Enhancement Service
 */
export class CreativeEnhancementService {
  private antiAveraging = new AntiAveragingEngine();

  /**
   * Enhance text with anti-averaging bias
   */
  async enhanceWithCreativity(
    text: string,
    userConfig: AntiAveragingConfig,
    _context?: string,
  ): Promise<{
    enhancedText: string;
    creativityMetrics: {
      originalAverageness: number;
      enhancedAverageness: number;
      creativityGain: number;
      riskAssessment: CreativeRiskAssessment;
    };
    reasoning: string[];
  }> {
    // Analyze original text
    const originalAnalysis = this.antiAveraging.analyzeAverageness(text);

    // Generate creative enhancement suggestions
    const creativeEnhancements =
      this.antiAveraging.generateCreativeEnhancements(text, userConfig);

    // Apply enhancements (this would integrate with your AI generation)
    const enhancedText = await this.applyCreativeEnhancements(
      text,
      creativeEnhancements.suggestions,
      userConfig,
    );

    // Analyze enhanced text
    const enhancedAnalysis =
      this.antiAveraging.analyzeAverageness(enhancedText);

    // Assess risk
    const riskAssessment = this.antiAveraging.assessCreativeRisk(
      text,
      enhancedText,
      userConfig,
    );

    const creativityGain =
      originalAnalysis.averagenessScore - enhancedAnalysis.averagenessScore;

    return {
      enhancedText,
      creativityMetrics: {
        originalAverageness: originalAnalysis.averagenessScore,
        enhancedAverageness: enhancedAnalysis.averagenessScore,
        creativityGain,
        riskAssessment,
      },
      reasoning: [
        `Reduced predictability by ${(creativityGain * 100).toFixed(0)}%`,
        ...creativeEnhancements.reasoning,
        ...riskAssessment.riskFactors.map(
          (factor) => `Creative risk: ${factor}`,
        ),
      ],
    };
  }

  /**
   * Apply creative enhancements (placeholder - would integrate with AI)
   */
  private async applyCreativeEnhancements(
    text: string,
    suggestions: string[],
    config: AntiAveragingConfig,
  ): Promise<string> {
    // This would integrate with your actual AI enhancement system
    // For now, return enhanced placeholder
    const creativityBoost =
      config.creativityBias > 1.0
        ? " [Enhanced with creative risk-taking]"
        : "";
    return text + creativityBoost;
  }
}
