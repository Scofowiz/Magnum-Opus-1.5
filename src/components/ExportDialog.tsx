import { useState, useEffect, type JSX } from "react";
import { api } from "../api/client";
import type { ExportConfig, AuthorDossier } from "../types/authorExport";
import {
  DEFAULT_EXPORT_CONFIGS,
  EXPORT_VARIABLES,
  AVAILABLE_FONTS,
  FONT_SIZES,
  LINE_HEIGHTS,
} from "../types/authorExport";
import { exportDocument } from "../utils/exportDocument";

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  projectGenre?: string;
  chapters: Array<{ title: string; content: string }>;
  currentChapterContent?: string;
  onMessage?: (message: { type: "success" | "error"; text: string }) => void;
}

export function ExportDialog({
  isOpen,
  onClose,
  projectTitle,
  projectGenre: _projectGenre,
  chapters,
  currentChapterContent,
  onMessage,
}: ExportDialogProps): JSX.Element | null {
  const [authorProfile, setAuthorProfile] = useState<AuthorDossier | null>(
    null,
  );
  const [configs, setConfigs] = useState<ExportConfig[]>(
    DEFAULT_EXPORT_CONFIGS,
  );
  const [selectedConfigId, setSelectedConfigId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<
    "preset" | "custom" | "ai" | "advanced"
  >("preset");
  const [isExporting, setIsExporting] = useState(false);
  const [customConfig, setCustomConfig] = useState<Partial<ExportConfig>>({});
  const [exportScope, setExportScope] = useState<"current" | "full">("full");
  const [showVariableHelp, setShowVariableHelp] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async (): Promise<void> => {
    try {
      const [profile, loadedConfigs] = await Promise.all([
        api.authorProfile.get(),
        api.exportConfigs.list(),
      ]);

      setAuthorProfile(profile);
      setConfigs(
        loadedConfigs.length > 0 ? loadedConfigs : DEFAULT_EXPORT_CONFIGS,
      );

      // Select default config
      const defaultConfig =
        loadedConfigs.find((c) => c.isDefault) ||
        loadedConfigs[0] ||
        DEFAULT_EXPORT_CONFIGS[0];
      if (defaultConfig) {
        setSelectedConfigId(defaultConfig.id);
        setCustomConfig(defaultConfig);
      }
    } catch (error) {
      console.error("Failed to load export data:", error);
      // Fall back to defaults
      setConfigs(DEFAULT_EXPORT_CONFIGS);
      setSelectedConfigId(DEFAULT_EXPORT_CONFIGS[0].id);
      setCustomConfig(DEFAULT_EXPORT_CONFIGS[0]);
    }
  };

  const getSelectedConfig = (): ExportConfig => {
    const baseConfig =
      configs.find((c) => c.id === selectedConfigId) ||
      DEFAULT_EXPORT_CONFIGS[0];
    return { ...baseConfig, ...customConfig } as ExportConfig;
  };

  const handleExport = async (
    format: "docx" | "pdf" | "txt" | "md" | "html",
  ): Promise<void> => {
    setIsExporting(true);
    try {
      const config = getSelectedConfig();
      const exportChapters =
        exportScope === "current" && currentChapterContent
          ? [{ title: projectTitle, content: currentChapterContent }]
          : chapters;

      await exportDocument(format, {
        title: projectTitle,
        author: authorProfile || undefined,
        content: currentChapterContent || "",
        chapters: exportChapters,
        config,
      });

      onMessage?.({
        type: "success",
        text: `Exported to ${format.toUpperCase()} successfully!`,
      });
      onClose();
    } catch (error) {
      onMessage?.({
        type: "error",
        text: `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const saveAsPreset = async (): Promise<void> => {
    const name = prompt("Enter a name for this export preset:");
    if (!name) return;

    try {
      const config = getSelectedConfig();
      const newConfig = await api.exportConfigs.create({
        ...config,
        name,
        isPreset: false,
        isDefault: false,
      });
      setConfigs((prev) => [...prev, newConfig]);
      onMessage?.({ type: "success", text: `Preset "${name}" saved!` });
    } catch {
      onMessage?.({ type: "error", text: "Failed to save preset" });
    }
  };

  if (!isOpen) return null;

  const config = getSelectedConfig();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <div>
            <h2 className="text-xl font-semibold text-stone-800">
              Export Document
            </h2>
            <p className="text-sm text-stone-600">
              Configure your export settings and choose a format
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg text-stone-500"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 space-y-6">
            {/* Scope Selection */}
            <div className="bg-stone-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-stone-700 mb-3">
                Export Scope
              </h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === "full"}
                    onChange={() => setExportScope("full")}
                    className="w-4 h-4"
                  />
                  <span>Full Book ({chapters.length} chapters)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === "current"}
                    onChange={() => setExportScope("current")}
                    className="w-4 h-4"
                  />
                  <span>Current Chapter Only</span>
                </label>
              </div>
            </div>

            {/* Preset Selection */}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Configuration Preset
              </label>
              <select
                value={selectedConfigId}
                onChange={(e) => {
                  setSelectedConfigId(e.target.value);
                  const selected = configs.find((c) => c.id === e.target.value);
                  if (selected) setCustomConfig(selected);
                }}
                className="w-full px-3 py-2 border border-stone-300 rounded-lg"
              >
                <optgroup label="Built-in Presets">
                  {configs
                    .filter((c) => c.isPreset)
                    .map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name} {config.isDefault ? "(Default)" : ""}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Custom Presets">
                  {configs
                    .filter((c) => !c.isPreset)
                    .map((config) => (
                      <option key={config.id} value={config.id}>
                        {config.name}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-stone-200">
              {[
                { id: "preset", label: "Typography" },
                { id: "custom", label: "Layout & Headers" },
                { id: "ai", label: "AI Cleanup" },
                { id: "advanced", label: "Advanced" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? "border-b-2 border-stone-800 text-stone-800"
                      : "text-stone-600 hover:text-stone-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="space-y-4">
              {activeTab === "preset" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Font
                    </label>
                    <select
                      value={config.font.family}
                      onChange={(e) =>
                        setCustomConfig((prev) => ({
                          ...prev,
                          font: { ...config.font, family: e.target.value },
                        }))
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    >
                      {AVAILABLE_FONTS.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Font Size
                    </label>
                    <select
                      value={config.font.size}
                      onChange={(e) =>
                        setCustomConfig((prev) => ({
                          ...prev,
                          font: {
                            ...config.font,
                            size: parseInt(e.target.value),
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    >
                      {FONT_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}pt
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Line Spacing
                    </label>
                    <select
                      value={config.font.lineHeight}
                      onChange={(e) =>
                        setCustomConfig((prev) => ({
                          ...prev,
                          font: {
                            ...config.font,
                            lineHeight: parseFloat(e.target.value),
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    >
                      {LINE_HEIGHTS.map((lh) => (
                        <option key={lh.value} value={lh.value}>
                          {lh.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Font Weight
                    </label>
                    <select
                      value={config.font.weight}
                      onChange={(e) =>
                        setCustomConfig((prev) => ({
                          ...prev,
                          font: {
                            ...config.font,
                            weight: e.target.value as "normal" | "bold",
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    >
                      <option value="normal">Normal</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                </div>
              )}

              {activeTab === "custom" && (
                <div className="space-y-4">
                  {/* Margins */}
                  <div>
                    <h4 className="text-sm font-medium text-stone-700 mb-2">
                      Margins
                    </h4>
                    <div className="grid grid-cols-4 gap-3">
                      {["top", "bottom", "left", "right"].map((side) => (
                        <div key={side}>
                          <label className="block text-xs text-stone-500 mb-1 capitalize">
                            {side}
                          </label>
                          <input
                            type="text"
                            value={
                              config.margins[
                                side as keyof typeof config.margins
                              ]
                            }
                            onChange={(e) =>
                              setCustomConfig((prev) => ({
                                ...prev,
                                margins: {
                                  ...config.margins,
                                  [side]: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                            placeholder="1in"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Paragraph Indentation */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="indentFirstOnly"
                          checked={config.paragraph.indentFirstOnly}
                          onChange={(e) =>
                            setCustomConfig((prev) => ({
                              ...prev,
                              paragraph: {
                                ...config.paragraph,
                                indentFirstOnly: e.target.checked,
                              },
                            }))
                          }
                          className="w-4 h-4"
                        />
                        <label
                          htmlFor="indentFirstOnly"
                          className="text-sm text-stone-700"
                        >
                          Indent first paragraph only
                        </label>
                      </div>
                      <input
                        type="text"
                        value={config.paragraph.indent}
                        onChange={(e) =>
                          setCustomConfig((prev) => ({
                            ...prev,
                            paragraph: {
                              ...config.paragraph,
                              indent: e.target.value,
                            },
                          }))
                        }
                        className="w-24 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                        placeholder="0.5in"
                      />
                    </div>
                  </div>

                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="headerEnabled"
                        checked={config.header.enabled}
                        onChange={(e) =>
                          setCustomConfig((prev) => ({
                            ...prev,
                            header: {
                              ...config.header,
                              enabled: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4"
                      />
                      <label
                        htmlFor="headerEnabled"
                        className="text-sm font-medium text-stone-700"
                      >
                        Enable Header
                      </label>
                    </div>

                    {config.header.enabled && (
                      <div className="ml-6 space-y-3">
                        <div>
                          <label className="block text-xs text-stone-500 mb-1">
                            Header Template
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={config.header.template}
                              onChange={(e) =>
                                setCustomConfig((prev) => ({
                                  ...prev,
                                  header: {
                                    ...config.header,
                                    template: e.target.value,
                                  },
                                }))
                              }
                              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm"
                              placeholder="{authorLastName} / {title} / {pageNumber}"
                            />
                            <button
                              onClick={() =>
                                setShowVariableHelp(!showVariableHelp)
                              }
                              className="px-3 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg"
                            >
                              Variables
                            </button>
                          </div>

                          {showVariableHelp && (
                            <div className="mt-2 p-3 bg-stone-50 rounded-lg text-xs text-stone-600">
                              <div className="grid grid-cols-3 gap-2">
                                {Object.entries(EXPORT_VARIABLES)
                                  .slice(0, 12)
                                  .map(([key, desc]) => (
                                    <div key={key}>
                                      <code className="text-stone-800">
                                        {key}
                                      </code>
                                      <div className="text-stone-500">
                                        {desc}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4">
                          <label className="text-sm text-stone-700">
                            Alignment:
                          </label>
                          {["left", "center", "right"].map((align) => (
                            <label
                              key={align}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="radio"
                                name="headerAlign"
                                value={align}
                                checked={config.header.align === align}
                                onChange={(e) =>
                                  setCustomConfig((prev) => ({
                                    ...prev,
                                    header: {
                                      ...config.header,
                                      align: e.target.value as
                                        | "left"
                                        | "center"
                                        | "right",
                                    },
                                  }))
                                }
                                className="w-4 h-4"
                              />
                              <span className="text-sm capitalize">
                                {align}
                              </span>
                            </label>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="differentFirstPage"
                            checked={config.header.differentFirstPage}
                            onChange={(e) =>
                              setCustomConfig((prev) => ({
                                ...prev,
                                header: {
                                  ...config.header,
                                  differentFirstPage: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <label
                            htmlFor="differentFirstPage"
                            className="text-sm text-stone-700"
                          >
                            Different header on first page (title page)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Title Page */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        type="checkbox"
                        id="titlePageEnabled"
                        checked={config.titlePage?.enabled}
                        onChange={(e) =>
                          setCustomConfig((prev) => ({
                            ...prev,
                            titlePage: {
                              enabled: e.target.checked,
                              template:
                                prev.titlePage?.template ||
                                config.titlePage?.template ||
                                "",
                              centerContent:
                                prev.titlePage?.centerContent ??
                                config.titlePage?.centerContent ??
                                true,
                              spacing:
                                prev.titlePage?.spacing ||
                                config.titlePage?.spacing ||
                                "2em",
                            },
                          }))
                        }
                        className="w-4 h-4"
                      />
                      <label
                        htmlFor="titlePageEnabled"
                        className="text-sm font-medium text-stone-700"
                      >
                        Include Title Page
                      </label>
                    </div>

                    {config.titlePage?.enabled && (
                      <div className="ml-6">
                        <textarea
                          value={config.titlePage?.template}
                          onChange={(e) =>
                            setCustomConfig((prev) => ({
                              ...prev,
                              titlePage: {
                                template: e.target.value,
                                enabled:
                                  prev.titlePage?.enabled ??
                                  config.titlePage?.enabled ??
                                  true,
                                centerContent:
                                  prev.titlePage?.centerContent ??
                                  config.titlePage?.centerContent ??
                                  true,
                                spacing:
                                  prev.titlePage?.spacing ||
                                  config.titlePage?.spacing ||
                                  "2em",
                              },
                            }))
                          }
                          className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                          rows={6}
                          placeholder="{title}&#92;&#92;n&#92;&#92;nBy&#92;&#92;n&#92;&#92;n{authorPenName}&#92;&#92;n&#92;&#92;n{wordCount} words"
                        />
                        <p className="text-xs text-stone-500 mt-1">
                          Use \\n for line breaks. Supports all author
                          variables.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Chapter Options */}
                  <div>
                    <h4 className="text-sm font-medium text-stone-700 mb-2">
                      Chapter Options
                    </h4>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.chapters.startOnNewPage}
                          onChange={(e) =>
                            setCustomConfig((prev) => ({
                              ...prev,
                              chapters: {
                                ...config.chapters,
                                startOnNewPage: e.target.checked,
                              },
                            }))
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm">
                          Start chapters on new page
                        </span>
                      </label>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={config.chapters.pageBreakBefore}
                          onChange={(e) =>
                            setCustomConfig((prev) => ({
                              ...prev,
                              chapters: {
                                ...config.chapters,
                                pageBreakBefore: e.target.checked,
                              },
                            }))
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm">
                          Page break before chapters
                        </span>
                      </label>
                    </div>

                    <div className="mt-3">
                      <label className="block text-xs text-stone-500 mb-1">
                        Chapter Numbering
                      </label>
                      <select
                        value={config.chapters.chapterNumbering}
                        onChange={(e) =>
                          setCustomConfig((prev) => ({
                            ...prev,
                            chapters: {
                              ...config.chapters,
                              chapterNumbering: e.target.value as
                                | "word"
                                | "numeral"
                                | "none",
                            },
                          }))
                        }
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm"
                      >
                        <option value="word">Word style (Chapter One)</option>
                        <option value="numeral">
                          Numeral style (Chapter 1)
                        </option>
                        <option value="none">No numbering</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "ai" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="aiCleanupEnabled"
                      checked={config.aiCleanup.enabled}
                      onChange={(e) =>
                        setCustomConfig((prev) => ({
                          ...prev,
                          aiCleanup: {
                            ...config.aiCleanup,
                            enabled: e.target.checked,
                          },
                        }))
                      }
                      className="w-4 h-4"
                    />
                    <label
                      htmlFor="aiCleanupEnabled"
                      className="text-sm font-medium text-stone-700"
                    >
                      Enable AI Artifact Cleanup
                    </label>
                  </div>

                  {config.aiCleanup.enabled && (
                    <div className="ml-6 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.aiCleanup.removeEmDashes}
                            onChange={(e) =>
                              setCustomConfig((prev) => ({
                                ...prev,
                                aiCleanup: {
                                  ...config.aiCleanup,
                                  removeEmDashes: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm">
                            Convert -- to em dash (—)
                          </span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.aiCleanup.removeDoubleSpaces}
                            onChange={(e) =>
                              setCustomConfig((prev) => ({
                                ...prev,
                                aiCleanup: {
                                  ...config.aiCleanup,
                                  removeDoubleSpaces: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm">Remove double spaces</span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.aiCleanup.normalizeQuotes}
                            onChange={(e) =>
                              setCustomConfig((prev) => ({
                                ...prev,
                                aiCleanup: {
                                  ...config.aiCleanup,
                                  normalizeQuotes: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm">
                            Normalize to smart quotes
                          </span>
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={config.aiCleanup.removeAsterisks}
                            onChange={(e) =>
                              setCustomConfig((prev) => ({
                                ...prev,
                                aiCleanup: {
                                  ...config.aiCleanup,
                                  removeAsterisks: e.target.checked,
                                },
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm">
                            Remove asterisk scene breaks
                          </span>
                        </label>
                      </div>

                      <div className="p-3 bg-stone-50 rounded-lg">
                        <p className="text-xs font-medium text-stone-700 mb-2">
                          Always Removed:
                        </p>
                        <ul className="text-xs text-stone-600 space-y-1 list-disc ml-4">
                          <li>[Generated content] markers</li>
                          <li>[AI-generated] markers</li>
                          <li>Timestamp markers (ISO format)</li>
                          <li>[Continuity check] markers</li>
                          <li>[Quality score] markers</li>
                          <li>[Fallback] markers</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "advanced" && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Custom Regex Patterns (Advanced)
                    </label>
                    <p className="text-xs text-stone-500 mb-2">
                      Add custom regex patterns to remove from exports (one per
                      line)
                    </p>
                    <textarea
                      value={(config.aiCleanup.customPatterns || []).join("\n")}
                      onChange={(e) =>
                        setCustomConfig((prev) => ({
                          ...prev,
                          aiCleanup: {
                            ...config.aiCleanup,
                            customPatterns: e.target.value
                              .split("\n")
                              .filter(Boolean),
                          },
                        }))
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm font-mono"
                      rows={4}
                      placeholder="\\[AI.*?\\]\n\\d{4}-\\d{2}-\\d{2}"
                    />
                  </div>

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Warning:</strong> Custom regex patterns will be
                      applied globally to your text. Invalid patterns may cause
                      export failures.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <button
                onClick={saveAsPreset}
                className="px-4 py-2 text-stone-600 hover:text-stone-800 text-sm"
              >
                Save as Preset
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-100"
              >
                Cancel
              </button>

              <div className="flex gap-1">
                {["txt", "md", "html", "docx", "pdf"].map((format) => (
                  <button
                    key={format}
                    onClick={() =>
                      handleExport(
                        format as "docx" | "pdf" | "txt" | "md" | "html",
                      )
                    }
                    disabled={isExporting}
                    className={`px-4 py-2 rounded-lg font-medium text-sm ${
                      format === "pdf"
                        ? "bg-stone-800 text-white hover:bg-stone-700"
                        : "bg-stone-200 text-stone-800 hover:bg-stone-300"
                    } disabled:opacity-50`}
                  >
                    {isExporting && format === "pdf"
                      ? "Exporting..."
                      : format.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
