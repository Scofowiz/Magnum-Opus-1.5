import { useState, useEffect, useRef, type ReactElement } from "react";
import { api } from "../api/client";

interface StyleFingerprint {
  vocabularyComplexity: number;
  avgSentenceLength: number;
  dialogueRatio: number;
  showVsTellRatio: number;
  passiveVoiceRatio: number;
  adverbDensity: number;
  metaphorFrequency: number;
  toneDescriptor: string;
  strengthAreas: string[];
  improvementAreas: string[];
  sampleCount: number;
}

const MIN_SAMPLE_CHARS = 500;
const MAX_SAMPLE_CHARS = 20000;

export function StyleLearning(): ReactElement {
  const [fingerprint, setFingerprint] = useState<StyleFingerprint | null>(null);
  const [sampleText, setSampleText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    api.style
      .get()
      .then((data) => {
        if (isMountedRef.current) {
          setFingerprint(data.fingerprint as StyleFingerprint | null);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return (): void => {
      isMountedRef.current = false;
    };
  }, []);

  const analyzeSample = async (): Promise<void> => {
    const trimmed = sampleText.trim();
    if (trimmed.length < MIN_SAMPLE_CHARS) {
      setError(`Sample must be at least ${MIN_SAMPLE_CHARS} characters`);
      return;
    }
    if (trimmed.length > MAX_SAMPLE_CHARS) {
      setError(`Sample must be ${MAX_SAMPLE_CHARS} characters or less`);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setSuccess(null);

    try {
      const data = (await api.style.uploadSample({ sample: trimmed })) as {
        fingerprint: StyleFingerprint;
      };
      setFingerprint(data.fingerprint);
      setSampleText("");
      setSuccess(
        "Sample analyzed successfully! Your style fingerprint has been updated.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetFingerprint = async (): Promise<void> => {
    if (
      !confirm(
        "Reset your style fingerprint? You will need to re-upload samples.",
      )
    )
      return;

    setIsClearing(true);
    setError(null);
    setSuccess(null);
    try {
      await api.style.clear();
      if (isMountedRef.current) {
        setFingerprint(null);
        setSuccess("Style fingerprint cleared.");
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError(
          e instanceof Error ? e.message : "Failed to reset fingerprint",
        );
      }
    } finally {
      if (isMountedRef.current) setIsClearing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-stone-800">Style Learning</h1>
        <p className="text-stone-600 mt-1">
          Upload samples of your writing so the AI can learn to match your
          unique voice and style.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Sample Upload */}
        <div className="env-card rounded-xl border border-stone-200 p-6">
          <h2 className="text-xl font-semibold text-stone-800 mb-4">
            Add Writing Sample
          </h2>

          <p className="text-sm text-stone-600 mb-4">
            Paste a sample of your writing (at least 500 characters). The more
            samples you add, the better the AI will learn your style. Use
            samples from your best work.
          </p>

          <label
            htmlFor="style-sample"
            className="block text-sm font-medium text-stone-700 mb-2"
          >
            Writing Sample
          </label>
          <textarea
            id="style-sample"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="Paste your writing sample here..."
            rows={10}
            className="w-full px-4 py-3 border border-stone-300 rounded-lg mb-3 font-mono text-sm bg-stone-50 text-stone-900 placeholder:text-stone-500 focus:bg-white focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            style={{ colorScheme: "light" }}
          />

          <div className="flex items-center justify-between">
            <span
              className={`text-sm ${sampleText.length >= 500 ? "text-green-600" : "text-stone-500"}`}
            >
              {sampleText.length} / 500 characters minimum
            </span>
            <button
              onClick={analyzeSample}
              disabled={isAnalyzing || sampleText.length < 500}
              className="px-6 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing..." : "Analyze Sample"}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
              {success}
            </div>
          )}
        </div>

        {/* Style Fingerprint */}
        <div className="env-card rounded-xl border border-stone-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-stone-800">
              Your Style Fingerprint
            </h2>
            {fingerprint && (
              <button
                onClick={resetFingerprint}
                disabled={isClearing}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {isClearing ? "Resetting..." : "Reset"}
              </button>
            )}
          </div>

          {fingerprint ? (
            <div className="space-y-4">
              <div className="text-sm text-stone-600 mb-4">
                Based on {fingerprint.sampleCount} sample
                {fingerprint.sampleCount !== 1 ? "s" : ""}
              </div>

              <StyleMeter
                label="Vocabulary Complexity"
                value={fingerprint.vocabularyComplexity}
                leftLabel="Simple"
                rightLabel="Sophisticated"
              />

              <StyleMeter
                label="Sentence Length"
                value={Math.min(1, fingerprint.avgSentenceLength / 30)}
                leftLabel="Short"
                rightLabel="Long"
                displayValue={`~${Math.round(fingerprint.avgSentenceLength)} words`}
              />

              <StyleMeter
                label="Dialogue Ratio"
                value={fingerprint.dialogueRatio}
                leftLabel="Low"
                rightLabel="High"
                displayValue={`${Math.round(fingerprint.dialogueRatio * 100)}%`}
              />

              <StyleMeter
                label="Show vs Tell"
                value={fingerprint.showVsTellRatio}
                leftLabel="Telling"
                rightLabel="Showing"
              />

              <StyleMeter
                label="Metaphor Usage"
                value={fingerprint.metaphorFrequency}
                leftLabel="Sparse"
                rightLabel="Rich"
              />

              <div className="pt-4 border-t border-stone-200">
                <div className="text-sm font-medium text-stone-700 mb-2">
                  Tone
                </div>
                <div className="text-stone-800 capitalize">
                  {fingerprint.toneDescriptor}
                </div>
              </div>

              {fingerprint.strengthAreas.length > 0 && (
                <div className="pt-4 border-t border-stone-200">
                  <div className="text-sm font-medium text-stone-700 mb-2">
                    Strengths
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fingerprint.strengthAreas.map((s, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {fingerprint.improvementAreas.length > 0 && (
                <div className="pt-4 border-t border-stone-200">
                  <div className="text-sm font-medium text-stone-700 mb-2">
                    Areas for Growth
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fingerprint.improvementAreas.map((s, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-sm"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">✍️</div>
              <p className="text-stone-600">
                No style fingerprint yet. Add writing samples to get started.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* How It Works */}
      <div className="env-card-soft mt-12 rounded-xl border border-stone-200 p-6">
        <h2 className="text-xl font-semibold text-stone-800 mb-4">
          How Style Learning Works
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <div className="text-2xl mb-2">1️⃣</div>
            <h3 className="font-medium text-stone-800 mb-1">Upload Samples</h3>
            <p className="text-sm text-stone-600">
              Paste excerpts from your best writing. Use different types of
              scenes for better coverage.
            </p>
          </div>
          <div>
            <div className="text-2xl mb-2">2️⃣</div>
            <h3 className="font-medium text-stone-800 mb-1">AI Analysis</h3>
            <p className="text-sm text-stone-600">
              The AI analyzes vocabulary, sentence structure, dialogue patterns,
              and more to build your fingerprint.
            </p>
          </div>
          <div>
            <div className="text-2xl mb-2">3️⃣</div>
            <h3 className="font-medium text-stone-800 mb-1">
              Matched Generation
            </h3>
            <p className="text-sm text-stone-600">
              Every generation uses your fingerprint to match your unique voice
              and style.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StyleMeter({
  label,
  value,
  leftLabel,
  rightLabel,
  displayValue,
}: {
  label: string;
  value: number;
  leftLabel: string;
  rightLabel: string;
  displayValue?: string;
}): ReactElement {
  const percentage = Math.round(value * 100);

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="text-stone-600">
          {displayValue || `${percentage}%`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-500 w-20">{leftLabel}</span>
        <div className="flex-1 bg-stone-200 rounded-full h-2">
          <div
            className="bg-stone-700 h-2 rounded-full transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span className="text-xs text-stone-500 w-20 text-right">
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
