import { useMemo, useState, type ReactElement } from "react";
import type { ProjectSummary } from "../types/magnumOpus";

interface ProjectListProps {
  projects: ProjectSummary[];
  isLoading: boolean;
  onOpen: (id: string) => void;
  onCreate: (title: string, genre: string) => void;
  onDelete: (id: string) => void;
}

type ProjectSortOption = "updated" | "name" | "size";

export function ProjectList({
  projects,
  isLoading,
  onOpen,
  onCreate,
  onDelete,
}: ProjectListProps): ReactElement {
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [sortBy, setSortBy] = useState<ProjectSortOption>("updated");

  const sortedProjects = useMemo(() => {
    const toTimestamp = (value: string): number => {
      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    return [...projects].sort((left, right) => {
      if (sortBy === "name") {
        return left.title.localeCompare(right.title, undefined, {
          sensitivity: "base",
        });
      }

      if (sortBy === "size") {
        return (
          right.wordCount - left.wordCount ||
          toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
        );
      }

      return (
        toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt) ||
        toTimestamp(right.createdAt) - toTimestamp(left.createdAt)
      );
    });
  }, [projects, sortBy]);

  const handleCreate = (): void => {
    if (newTitle.trim()) {
      onCreate(newTitle.trim(), newGenre.trim());
      setNewTitle("");
      setNewGenre("");
      setShowCreate(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-stone-800">Your Projects</h1>
          <p className="text-stone-600 mt-1">
            Create and manage your writing projects
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {!isLoading && projects.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <span className="font-medium text-stone-700">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ProjectSortOption)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value="updated">Date updated</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
              </select>
            </label>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 font-medium"
          >
            + New Project
          </button>
        </div>
      </div>

      {/* Create Project Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="env-chrome w-full max-w-md rounded-xl border border-stone-200 p-6 shadow-xl">
            <h2 className="text-xl font-bold text-stone-800 mb-4">
              Create New Project
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Project Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="My Novel"
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Genre (optional)
                </label>
                <select
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400"
                >
                  <option value="">Select a genre...</option>
                  <option value="fantasy">Fantasy</option>
                  <option value="science-fiction">Science Fiction</option>
                  <option value="mystery">Mystery</option>
                  <option value="thriller">Thriller</option>
                  <option value="romance">Romance</option>
                  <option value="horror">Horror</option>
                  <option value="literary">Literary Fiction</option>
                  <option value="historical">Historical Fiction</option>
                  <option value="young-adult">Young Adult</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 border border-stone-300 rounded-lg hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim()}
                  className="flex-1 px-4 py-2 bg-stone-800 text-white rounded-lg hover:bg-stone-700 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project Grid */}
      {isLoading ? (
        <div
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          aria-label="Loading projects"
        >
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="env-card rounded-xl border border-stone-200 p-5"
            >
              <div className="mb-4 h-6 w-2/3 animate-pulse rounded bg-stone-200" />
              <div className="mb-5 h-4 w-1/3 animate-pulse rounded bg-stone-100" />
              <div className="mb-6 flex gap-3">
                <div className="h-4 w-20 animate-pulse rounded bg-stone-100" />
                <div className="h-4 w-16 animate-pulse rounded bg-stone-100" />
              </div>
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 animate-pulse rounded bg-stone-100" />
                <div className="h-9 w-20 animate-pulse rounded-lg bg-stone-200" />
              </div>
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-xl font-semibold text-stone-800 mb-2">
            No projects yet
          </h2>
          <p className="text-stone-600 mb-6">
            Create your first project to start writing
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-6 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 font-medium"
          >
            Create Your First Project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => onOpen(project.id)}
              onDelete={() => {
                if (
                  confirm(`Delete "${project.title}"? This cannot be undone.`)
                ) {
                  onDelete(project.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Features Section */}
      <div className="mt-16 border-t border-stone-200 pt-12">
        <h2 className="text-2xl font-bold text-stone-800 mb-6">
          Magnum Opus Features
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon="📖"
            title="10k Bidirectional Context"
            description="Generate text with awareness of 10,000 characters before AND after your cursor position."
          />
          <FeatureCard
            icon="📚"
            title="Story Bible"
            description="Define characters, world, plot, and style. The AI uses this to maintain consistency."
          />
          <FeatureCard
            icon="✍️"
            title="Style Learning"
            description="Upload your writing samples and the AI learns to match your unique voice and style."
          />
          <FeatureCard
            icon="🎯"
            title="Quality Scoring"
            description="Every generation is scored for quality. Low scores trigger automatic regeneration."
          />
          <FeatureCard
            icon="🔄"
            title="RLHF Feedback"
            description="Accept or reject generations to continuously improve output quality over time."
          />
          <FeatureCard
            icon="🤖"
            title="Autonomous Mode"
            description="Let the AI write entire chapters while you review at key milestones."
          />
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onDelete: () => void;
}): ReactElement {
  const updatedDate = new Date(project.updatedAt).toLocaleDateString();

  return (
    <div className="env-card rounded-xl border border-stone-200 p-5 transition-shadow hover:shadow-lg">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-stone-800 text-lg">
            {project.title}
          </h3>
          {project.genre && (
            <span className="text-sm text-stone-500 capitalize">
              {project.genre}
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 text-stone-400 hover:text-red-500 transition-colors"
          title="Delete project"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-stone-500 mb-4">
        <span>{project.wordCount.toLocaleString()} words</span>
        {project.chapterCount !== undefined && (
          <span>{project.chapterCount} chapters</span>
        )}
        {project.hasStoryBible && (
          <span className="text-green-600">📖 Bible</span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-400">Updated {updatedDate}</span>
        <button
          onClick={onOpen}
          className="px-4 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700"
        >
          Open
        </button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}): ReactElement {
  return (
    <div className="env-card-soft rounded-xl border border-stone-200 p-5">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="font-semibold text-stone-800 mb-2">{title}</h3>
      <p className="text-sm text-stone-600">{description}</p>
    </div>
  );
}
