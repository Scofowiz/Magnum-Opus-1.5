import { useState, useEffect, useCallback, type JSX } from "react";
import { api } from "../api/client";
import type {
  AuthorDossier,
  PenName,
  Publication,
} from "../types/authorExport";

interface AuthorProfileProps {
  onMessage?: (message: { type: "success" | "error"; text: string }) => void;
}

const DEFAULT_DOSSIER: AuthorDossier = {
  legalName: { first: "", middle: "", last: "" },
  penNames: [],
  email: "",
  phone: "",
  address: {
    street: "",
    city: "",
    state: "",
    zip: "",
    country: "",
  },
  shortBio: "",
  mediumBio: "",
  longBio: "",
  accolades: [],
  publications: [],
  agent: { name: "", agency: "", email: "" },
  memberships: [],
  website: "",
  newsletter: "",
  social: {
    twitter: "",
    bluesky: "",
    instagram: "",
    facebook: "",
    goodreads: "",
    amazonAuthorPage: "",
  },
};

export function AuthorProfile({ onMessage }: AuthorProfileProps): JSX.Element {
  const [dossier, setDossier] = useState<AuthorDossier>(DEFAULT_DOSSIER);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPenNameForm, setShowPenNameForm] = useState(false);
  const [newPenName, setNewPenName] = useState("");
  const [newPenNameGenre, setNewPenNameGenre] = useState("");
  const [showAccoladeForm, setShowAccoladeForm] = useState(false);
  const [newAccolade, setNewAccolade] = useState("");
  const [showPublicationForm, setShowPublicationForm] = useState(false);
  const [newPublication, setNewPublication] = useState<Partial<Publication>>(
    {},
  );
  const [activeTab, setActiveTab] = useState<
    "identity" | "professional" | "digital" | "agent"
  >("identity");

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async (): Promise<void> => {
    try {
      const profile = await api.authorProfile.get();
      if (profile) {
        setDossier({ ...DEFAULT_DOSSIER, ...profile });
      }
    } catch (error) {
      console.error("Failed to load author profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveProfile = async (): Promise<void> => {
    setIsSaving(true);
    try {
      await api.authorProfile.save(dossier);
      onMessage?.({
        type: "success",
        text: "Author profile saved successfully!",
      });
    } catch {
      onMessage?.({ type: "error", text: "Failed to save author profile" });
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = useCallback(
    <K extends keyof AuthorDossier>(field: K, value: AuthorDossier[K]) => {
      setDossier((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const updateNestedField = useCallback(
    <_T extends Record<string, unknown>>(
      parentField: keyof AuthorDossier,
      nestedField: string,
      value: unknown,
    ) => {
      setDossier((prev) => ({
        ...prev,
        [parentField]: {
          ...(prev[parentField] as Record<string, unknown>),
          [nestedField]: value,
        },
      }));
    },
    [],
  );

  const addPenName = (): void => {
    if (!newPenName.trim()) return;

    const penName: PenName = {
      name: newPenName.trim(),
      isPrimary: dossier.penNames.length === 0,
      genre: newPenNameGenre.trim() || undefined,
    };

    updateField("penNames", [...dossier.penNames, penName]);
    setNewPenName("");
    setNewPenNameGenre("");
    setShowPenNameForm(false);
  };

  const removePenName = (index: number): void => {
    const newPenNames = [...dossier.penNames];
    const wasPrimary = newPenNames[index].isPrimary;
    newPenNames.splice(index, 1);

    // Ensure at least one primary pen name
    if (wasPrimary && newPenNames.length > 0) {
      newPenNames[0].isPrimary = true;
    }

    updateField("penNames", newPenNames);
  };

  const setPrimaryPenName = (index: number): void => {
    const newPenNames = dossier.penNames.map((pn, i) => ({
      ...pn,
      isPrimary: i === index,
    }));
    updateField("penNames", newPenNames);
  };

  const addAccolade = (): void => {
    if (!newAccolade.trim()) return;
    updateField("accolades", [
      ...(dossier.accolades || []),
      newAccolade.trim(),
    ]);
    setNewAccolade("");
    setShowAccoladeForm(false);
  };

  const removeAccolade = (index: number): void => {
    const newAccolades = [...(dossier.accolades || [])];
    newAccolades.splice(index, 1);
    updateField("accolades", newAccolades);
  };

  const addPublication = (): void => {
    if (!newPublication.title?.trim()) return;

    const publication: Publication = {
      title: newPublication.title.trim(),
      publisher: newPublication.publisher?.trim() || undefined,
      year: newPublication.year
        ? parseInt(String(newPublication.year))
        : undefined,
      isbn: newPublication.isbn?.trim() || undefined,
      link: newPublication.link?.trim() || undefined,
    };

    updateField("publications", [...(dossier.publications || []), publication]);
    setNewPublication({});
    setShowPublicationForm(false);
  };

  const removePublication = (index: number): void => {
    const newPublications = [...(dossier.publications || [])];
    newPublications.splice(index, 1);
    updateField("publications", newPublications);
  };

  const addMembership = (membership: string): void => {
    if (!membership.trim()) return;
    const newMemberships = [...(dossier.memberships || []), membership.trim()];
    updateField("memberships", newMemberships);
  };

  const removeMembership = (index: number): void => {
    const newMemberships = [...(dossier.memberships || [])];
    newMemberships.splice(index, 1);
    updateField("memberships", newMemberships);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-stone-300 border-t-amber-500 rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="author-profile-shell space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-stone-800">
              Author Profile
            </h2>
            <p className="text-stone-600 mt-1">
              Your professional information used for exports, query letters, and
              manuscript headers.
            </p>
          </div>
          <button
            onClick={saveProfile}
            disabled={isSaving}
            className="px-6 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50 font-medium"
          >
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-stone-200">
        {[
          { id: "identity", label: "Identity", icon: "👤" },
          { id: "professional", label: "Professional", icon: "🏆" },
          { id: "digital", label: "Digital Presence", icon: "🌐" },
          { id: "agent", label: "Agent & Publisher", icon: "📚" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? "bg-stone-800 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        {activeTab === "identity" && (
          <div className="space-y-6">
            {/* Legal Name */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Legal Name
              </h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    First
                  </label>
                  <input
                    type="text"
                    value={dossier.legalName?.first || ""}
                    onChange={(e) =>
                      updateNestedField("legalName", "first", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Middle
                  </label>
                  <input
                    type="text"
                    value={dossier.legalName?.middle || ""}
                    onChange={(e) =>
                      updateNestedField("legalName", "middle", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="M."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Last *
                  </label>
                  <input
                    type="text"
                    value={dossier.legalName?.last || ""}
                    onChange={(e) =>
                      updateNestedField("legalName", "last", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Suffix
                  </label>
                  <input
                    type="text"
                    value={dossier.legalName?.suffix || ""}
                    onChange={(e) =>
                      updateNestedField("legalName", "suffix", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="Jr., III"
                  />
                </div>
              </div>
            </div>

            {/* Pen Names */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Pen Names
              </h3>
              <div className="space-y-2">
                {dossier.penNames.length === 0 ? (
                  <p className="text-stone-500 italic">No pen names added</p>
                ) : (
                  dossier.penNames.map((pn, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {pn.isPrimary && (
                          <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-full">
                            Primary
                          </span>
                        )}
                        <span className="font-medium">{pn.name}</span>
                        {pn.genre && (
                          <span className="text-stone-500 text-sm">
                            ({pn.genre})
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {!pn.isPrimary && (
                          <button
                            onClick={() => setPrimaryPenName(index)}
                            className="text-xs text-stone-600 hover:text-stone-800"
                          >
                            Set Primary
                          </button>
                        )}
                        <button
                          onClick={() => removePenName(index)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {showPenNameForm ? (
                <div className="mt-4 p-4 bg-stone-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        Pen Name *
                      </label>
                      <input
                        type="text"
                        value={newPenName}
                        onChange={(e) => setNewPenName(e.target.value)}
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                        placeholder="J.K. Rowling"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        Genre
                      </label>
                      <input
                        type="text"
                        value={newPenNameGenre}
                        onChange={(e) => setNewPenNameGenre(e.target.value)}
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                        placeholder="Fantasy"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={addPenName}
                      disabled={!newPenName.trim()}
                      className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50"
                    >
                      Add Pen Name
                    </button>
                    <button
                      onClick={() => {
                        setShowPenNameForm(false);
                        setNewPenName("");
                        setNewPenNameGenre("");
                      }}
                      className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowPenNameForm(true)}
                  className="mt-4 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  + Add Pen Name
                </button>
              )}
            </div>

            {/* Contact Info */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Contact Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={dossier.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={dossier.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="(555) 123-4567"
                  />
                </div>
              </div>
            </div>

            {/* Address */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Address
              </h3>
              <p className="text-stone-500 text-sm mb-3">
                Optional. Only fill out if you want it included in manuscripts.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Street
                  </label>
                  <input
                    type="text"
                    value={dossier.address?.street || ""}
                    onChange={(e) =>
                      updateNestedField("address", "street", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="123 Writer's Lane"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={dossier.address?.city || ""}
                      onChange={(e) =>
                        updateNestedField("address", "city", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={dossier.address?.state || ""}
                      onChange={(e) =>
                        updateNestedField("address", "state", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                      placeholder="NY"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      ZIP
                    </label>
                    <input
                      type="text"
                      value={dossier.address?.zip || ""}
                      onChange={(e) =>
                        updateNestedField("address", "zip", e.target.value)
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                      placeholder="10001"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={dossier.address?.country || ""}
                    onChange={(e) =>
                      updateNestedField("address", "country", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="United States"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "professional" && (
          <div className="space-y-6">
            {/* Biographies */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Biographies
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Short Bio (50 words) — For query letters
                  </label>
                  <textarea
                    value={dossier.shortBio || ""}
                    onChange={(e) => updateField("shortBio", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg h-20"
                    placeholder="Award-winning author of..."
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    {
                      (dossier.shortBio || "").split(/\s+/).filter(Boolean)
                        .length
                    }{" "}
                    / 50 words
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Medium Bio (150 words) — For author pages
                  </label>
                  <textarea
                    value={dossier.mediumBio || ""}
                    onChange={(e) => updateField("mediumBio", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg h-32"
                    placeholder="Jane Smith writes..."
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    {
                      (dossier.mediumBio || "").split(/\s+/).filter(Boolean)
                        .length
                    }{" "}
                    / 150 words
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Long Bio (300 words) — For websites
                  </label>
                  <textarea
                    value={dossier.longBio || ""}
                    onChange={(e) => updateField("longBio", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg h-40"
                    placeholder="Jane Smith is a novelist..."
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    {
                      (dossier.longBio || "").split(/\s+/).filter(Boolean)
                        .length
                    }{" "}
                    / 300 words
                  </p>
                </div>
              </div>
            </div>

            {/* Accolades */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Accolades & Awards
              </h3>
              <div className="space-y-2">
                {(dossier.accolades || []).length === 0 ? (
                  <p className="text-stone-500 italic">No accolades added</p>
                ) : (
                  (dossier.accolades || []).map((accolade, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                    >
                      <span>{accolade}</span>
                      <button
                        onClick={() => removeAccolade(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              {showAccoladeForm ? (
                <div className="mt-4 p-4 bg-stone-50 rounded-lg">
                  <input
                    type="text"
                    value={newAccolade}
                    onChange={(e) => setNewAccolade(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg mb-3"
                    placeholder="Pulitzer Prize for Fiction, 2024"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={addAccolade}
                      disabled={!newAccolade.trim()}
                      className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50"
                    >
                      Add Accolade
                    </button>
                    <button
                      onClick={() => {
                        setShowAccoladeForm(false);
                        setNewAccolade("");
                      }}
                      className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAccoladeForm(true)}
                  className="mt-4 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  + Add Accolade
                </button>
              )}
            </div>

            {/* Publications */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Previous Publications
              </h3>
              <div className="space-y-2">
                {(dossier.publications || []).length === 0 ? (
                  <p className="text-stone-500 italic">No publications added</p>
                ) : (
                  (dossier.publications || []).map((pub, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                    >
                      <div>
                        <span className="font-medium">{pub.title}</span>
                        {pub.publisher && (
                          <span className="text-stone-500">
                            {" "}
                            — {pub.publisher}
                          </span>
                        )}
                        {pub.year && (
                          <span className="text-stone-400"> ({pub.year})</span>
                        )}
                      </div>
                      <button
                        onClick={() => removePublication(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>

              {showPublicationForm ? (
                <div className="mt-4 p-4 bg-stone-50 rounded-lg space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">
                      Title *
                    </label>
                    <input
                      type="text"
                      value={newPublication.title || ""}
                      onChange={(e) =>
                        setNewPublication({
                          ...newPublication,
                          title: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                      placeholder="The Great Novel"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        Publisher
                      </label>
                      <input
                        type="text"
                        value={newPublication.publisher || ""}
                        onChange={(e) =>
                          setNewPublication({
                            ...newPublication,
                            publisher: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                        placeholder="Penguin Random House"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        Year
                      </label>
                      <input
                        type="number"
                        value={newPublication.year || ""}
                        onChange={(e) =>
                          setNewPublication({
                            ...newPublication,
                            year: parseInt(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                        placeholder="2024"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        ISBN
                      </label>
                      <input
                        type="text"
                        value={newPublication.isbn || ""}
                        onChange={(e) =>
                          setNewPublication({
                            ...newPublication,
                            isbn: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                        placeholder="978-0-123456-78-9"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-stone-700 mb-1">
                        Link
                      </label>
                      <input
                        type="url"
                        value={newPublication.link || ""}
                        onChange={(e) =>
                          setNewPublication({
                            ...newPublication,
                            link: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addPublication}
                      disabled={!newPublication.title?.trim()}
                      className="px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50"
                    >
                      Add Publication
                    </button>
                    <button
                      onClick={() => {
                        setShowPublicationForm(false);
                        setNewPublication({});
                      }}
                      className="px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowPublicationForm(true)}
                  className="mt-4 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  + Add Publication
                </button>
              )}
            </div>

            {/* Memberships */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Memberships
              </h3>
              <div className="space-y-2">
                {(dossier.memberships || []).length === 0 ? (
                  <p className="text-stone-500 italic">No memberships added</p>
                ) : (
                  (dossier.memberships || []).map((membership, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-stone-50 rounded-lg"
                    >
                      <span>{membership}</span>
                      <button
                        onClick={() => removeMembership(index)}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={() => {
                  const membership = prompt("Enter membership organization:");
                  if (membership) addMembership(membership);
                }}
                className="mt-4 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
              >
                + Add Membership
              </button>
            </div>
          </div>
        )}

        {activeTab === "digital" && (
          <div className="space-y-6">
            {/* Website & Newsletter */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Website & Newsletter
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Author Website
                  </label>
                  <input
                    type="url"
                    value={dossier.website || ""}
                    onChange={(e) => updateField("website", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="https://janesmith.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Newsletter Signup
                  </label>
                  <input
                    type="url"
                    value={dossier.newsletter || ""}
                    onChange={(e) => updateField("newsletter", e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="https://substack.com/..."
                  />
                </div>
              </div>
            </div>

            {/* Social Media */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Social Media
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Twitter/X
                  </label>
                  <input
                    type="text"
                    value={dossier.social?.twitter || ""}
                    onChange={(e) =>
                      updateNestedField("social", "twitter", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="@username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Bluesky
                  </label>
                  <input
                    type="text"
                    value={dossier.social?.bluesky || ""}
                    onChange={(e) =>
                      updateNestedField("social", "bluesky", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="@username.bsky.social"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Instagram
                  </label>
                  <input
                    type="text"
                    value={dossier.social?.instagram || ""}
                    onChange={(e) =>
                      updateNestedField("social", "instagram", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="@username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Facebook
                  </label>
                  <input
                    type="text"
                    value={dossier.social?.facebook || ""}
                    onChange={(e) =>
                      updateNestedField("social", "facebook", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="username"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Goodreads
                  </label>
                  <input
                    type="text"
                    value={dossier.social?.goodreads || ""}
                    onChange={(e) =>
                      updateNestedField("social", "goodreads", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="goodreads.com/..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Amazon Author Page
                  </label>
                  <input
                    type="text"
                    value={dossier.social?.amazonAuthorPage || ""}
                    onChange={(e) =>
                      updateNestedField(
                        "social",
                        "amazonAuthorPage",
                        e.target.value,
                      )
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="amazon.com/author/..."
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "agent" && (
          <div className="space-y-6">
            {/* Literary Agent */}
            <div>
              <h3 className="text-lg font-semibold text-stone-800 mb-4">
                Literary Agent
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    value={dossier.agent?.name || ""}
                    onChange={(e) =>
                      updateNestedField("agent", "name", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Agency
                  </label>
                  <input
                    type="text"
                    value={dossier.agent?.agency || ""}
                    onChange={(e) =>
                      updateNestedField("agent", "agency", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="Writers House"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Agent Email
                  </label>
                  <input
                    type="email"
                    value={dossier.agent?.email || ""}
                    onChange={(e) =>
                      updateNestedField("agent", "email", e.target.value)
                    }
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg"
                    placeholder="agent@agency.com"
                  />
                </div>
              </div>
            </div>

            {/* Variable Preview */}
            <div className="mt-8 p-4 bg-stone-50 rounded-lg">
              <h3 className="text-sm font-semibold text-stone-800 mb-2">
                Available Variables for Exports
              </h3>
              <p className="text-sm text-stone-600 mb-3">
                These can be used in export templates (headers, title pages,
                etc.):
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-stone-600">
                <code>{`{authorLegalFull}`}</code>
                <code>{`{authorLegalName}`}</code>
                <code>{`{authorLastName}`}</code>
                <code>{`{authorPenName}`}</code>
                <code>{`{authorEmail}`}</code>
                <code>{`{authorAddress}`}</code>
                <code>{`{agentName}`}</code>
                <code>{`{agentAgency}`}</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
