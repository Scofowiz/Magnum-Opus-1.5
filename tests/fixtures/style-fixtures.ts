/**
 * Style Analysis Test Fixtures
 *
 * Test data for anti-averaging and style fingerprint tests.
 */

export const GENERIC_TEXT_SAMPLES = {
  clichedOpening: `It was a dark and stormy night. Little did they know that everything was about to change.
    The protagonist felt a wave of emotion wash over them as they looked out at the rain.`,

  emotionalTelling: `She felt sad. He was angry. They were all filled with dread.
    A sense of fear washed over the group as they realized what had happened.
    Her heart pounded in her chest and her blood ran cold.`,

  weakDialogueTags: `"We need to go," she exclaimed breathlessly.
    "I don't think so," he retorted angrily.
    "Why not?" she queried nervously.
    "Because I said so," he growled menacingly.`,

  aiPatterns: `It's worth noting that the situation was complex. In this moment, she found herself
    reflecting on what had happened. She couldn't help but notice that things had changed.
    The decision was particularly significant given the circumstances.
    Interestingly enough, the outcome was unexpected.`,

  genericDescriptions: `He had piercing blue eyes and a chiseled jaw. Her curvaceous figure
    drew attention as she walked by. The water was crystal clear and the sand was silky smooth.`,
};

export const GOOD_TEXT_SAMPLES = {
  showNotTell: `Maria's hands trembled as she set down the coffee cup, spilling dark liquid
    across the white tablecloth. She pressed her palms flat against the linen,
    willing them to stillness. The cup's ceramic edge had left a red crescent
    on her lower lip where she'd bitten down.`,

  strongDialogue: `"I can't do this anymore." She turned away from the window.
    Marcus said nothing. He picked at a loose thread on his sleeve.
    "Did you hear me?"
    "I heard you." He looked up. "I just don't believe you."`,

  vividDescription: `The diner smelled of old grease and burnt coffee, the kind of smell
    that seeped into your clothes and stayed there. Cracked vinyl booths lined one wall,
    their red faded to the color of dried blood. A ceiling fan clicked overhead,
    accomplishing nothing against the August heat.`,

  variedRhythm: `She ran. The warehouse door slammed behind her. Three blocks.
    If she could make it three blocks to the subway entrance, she might lose them
    in the crowd. Her lungs burned. The footsteps behind her grew louder,
    closer, impossibly close now, and she knew with sudden clarity that three blocks
    might as well be three hundred.`,
};

export const STYLE_FINGERPRINT_SAMPLES = {
  literaryFiction: {
    avgSentenceLength: 18,
    dialogueRatio: 0.25,
    passiveVoiceRatio: 0.08,
    adverbDensity: 0.015,
    vocabularyComplexity: 0.7,
    toneDescriptor: 'contemplative',
    showVsTellRatio: 0.8,
    metaphorFrequency: 0.06,
    strengths: ['imagery', 'subtext', 'character interiority'],
    improvements: ['pacing'],
    signaturePhrases: ['the weight of', 'something like', 'almost'],
    dialogueTags: {
      preferred: ['said', 'asked'],
      avoided: ['exclaimed', 'declared', 'retorted'],
    },
    verbChoices: {
      movement: ['drifted', 'settled', 'pressed'],
      speech: ['murmured', 'said', 'asked'],
      emotion: ['ached', 'burned', 'twisted'],
    },
    sentencePatterns: ['Short. Then long, flowing sentences that build and build.'],
    sceneOpenings: ['sensory detail', 'character in action'],
    tensionTechniques: ['delayed revelation', 'subtext', 'physical tells'],
    humorStyle: 'dark and understated',
    emotionalPalette: ['melancholy', 'longing', 'quiet hope'],
    exemplars: [],
    avoidances: ['adverbs', 'said bookisms', 'purple prose'],
    sampleCount: 5,
  },

  thriller: {
    avgSentenceLength: 12,
    dialogueRatio: 0.35,
    passiveVoiceRatio: 0.05,
    adverbDensity: 0.02,
    vocabularyComplexity: 0.5,
    toneDescriptor: 'tense',
    showVsTellRatio: 0.75,
    metaphorFrequency: 0.03,
    strengths: ['pacing', 'tension', 'action'],
    improvements: ['character depth'],
    signaturePhrases: ['had to', 'no time', 'only one chance'],
    dialogueTags: {
      preferred: ['said'],
      avoided: ['hissed', 'snarled', 'breathed'],
    },
    verbChoices: {
      movement: ['sprinted', 'ducked', 'slammed'],
      speech: ['said', 'snapped'],
      emotion: ['gripped', 'flooded', 'surged'],
    },
    sentencePatterns: ['Short punchy sentences. Action. Reaction. No time to think.'],
    sceneOpenings: ['immediate action', 'time pressure'],
    tensionTechniques: ['ticking clock', 'confined space', 'divided loyalties'],
    humorStyle: 'gallows humor',
    emotionalPalette: ['fear', 'determination', 'betrayal'],
    exemplars: [],
    avoidances: ['long descriptions', 'philosophical tangents'],
    sampleCount: 3,
  },
};

export const CONTINUITY_TEST_CASES = {
  characterInconsistency: {
    storyBible: {
      characters: [
        {
          id: 'char-1',
          name: 'Sarah',
          description: 'Brown hair, green eyes',
          backstory: 'Grew up in Chicago',
        },
      ],
    },
    previousContent: 'Sarah brushed her brown hair from her face.',
    generatedContent: 'Sarah tucked a strand of blonde hair behind her ear.',
    expectedIssue: 'hair color changed from brown to blonde',
  },

  locationInconsistency: {
    storyBible: {
      world: {
        locations: [{ name: 'The Rusty Anchor', description: 'A bar on the waterfront' }],
      },
    },
    previousContent: 'They agreed to meet at The Rusty Anchor tomorrow night.',
    generatedContent: 'The next morning, she walked into The Rusty Anchor.',
    expectedIssue: 'time inconsistency: agreed to meet at night, but arrived in morning',
  },

  plotThreadInconsistency: {
    storyBible: {
      plotStructure: {
        plotThreads: [
          { id: 'thread-1', name: 'Missing artifact', status: 'active' },
        ],
      },
    },
    previousContent: 'The artifact was still missing. They had no leads.',
    generatedContent: 'She placed the recovered artifact on the table.',
    expectedIssue: 'artifact found without showing how it was recovered',
  },
};

export const GENERATION_CONTEXT_SAMPLES = {
  withFullBible: {
    project: {
      id: 'proj-1',
      title: 'Test Novel',
      chapters: [
        { id: 'ch-1', title: 'Chapter 1', content: 'Opening chapter content.' },
      ],
      storyBible: {
        premise: { logline: 'A detective solves mysteries', tone: 'noir' },
        characters: [{ name: 'Detective Jake', role: 'protagonist' }],
        styleDirectives: { pov: 'First person', tense: 'Past' },
      },
    },
    context: {
      beforeCursor: 'I walked into the office.',
      afterCursor: 'The phone rang.',
    },
    styleFingerprint: STYLE_FINGERPRINT_SAMPLES.thriller,
  },

  minimalContext: {
    project: {
      id: 'proj-2',
      title: 'Untitled',
      chapters: [],
      storyBible: null,
    },
    context: {
      beforeCursor: '',
      afterCursor: '',
    },
    styleFingerprint: null,
  },
};
