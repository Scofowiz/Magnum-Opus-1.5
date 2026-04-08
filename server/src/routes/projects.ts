import type { Express, Request, Response } from "express";
import type { LifetimeMemory, Project } from "../domain/types.js";
import {
  countPlainWords,
  createChapter,
  rebuildProjectTotals,
} from "../services/projects/projectState.js";
import { recordProjectMemoryFromChapterSave } from "../services/memory/fourLayerMemory.js";

interface DatabaseProject {
  id: string;
  title: string;
  content: string;
  storyBible: Project["storyBible"];
  wordCount: number;
}

interface DatabaseChapter {
  id: string;
  projectId: string;
  title: string;
  content: string;
  wordCount: number;
  sortOrder: number;
}

interface ProjectsRouteDeps {
  db: {
    getProject(projectId: string): DatabaseProject | undefined;
    saveProject(project: DatabaseProject): void;
    getChapter(
      chapterId: string,
    ): { content: string; word_count: number } | undefined;
    saveChapter(chapter: DatabaseChapter): void;
    saveChapterWithHistory(input: {
      chapterId: string;
      content: string;
      wordCount: number;
      trigger: string;
    }): void;
    resolveGeneratedDraft(id: string, status: "persisted" | "dismissed"): void;
    getChapterHistory(chapterId: string, limit: number): unknown;
    restoreChapterVersion(chapterId: string, versionId: number): void;
    checkDatabaseHealth(): unknown;
  };
  projects: Map<string, Project>;
  logger: {
    info(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  getLifetimeMemory?(): LifetimeMemory;
  persistLifetimeMemory?(): void;
  persistProjects(): void;
  refreshLifetimeInsights?(): void;
  trackRequest(endpoint: string): void;
}

export function registerProjectRoutes(
  app: Express,
  deps: ProjectsRouteDeps,
): void {
  app.get("/api/projects", (_req: Request, res: Response) => {
    deps.trackRequest("/api/projects");
    const projectList = Array.from(deps.projects.values()).map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description,
      genre: project.genre,
      wordCount: project.wordCount,
      chapterCount: project.chapters.length,
      hasStoryBible: !!project.storyBible,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    res.json(projectList);
  });

  app.post("/api/projects", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects");
    const { title, description = "", genre = "" } = req.body;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const project: Project = {
      id,
      title: title || "Untitled Project",
      description,
      genre,
      content: "",
      wordCount: 0,
      chapters: [createChapter("Chapter 1", 0)],
      storyBible: null,
      createdAt: now,
      updatedAt: now,
    };

    deps.projects.set(id, project);
    deps.persistProjects();

    res.json(project);
  });

  app.get("/api/projects/:id", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  });

  app.put("/api/projects/:id", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const { title, description, genre, content, storyBible } = req.body;

    if (title !== undefined && typeof title !== "string") {
      return res.status(400).json({ error: "title must be a string" });
    }
    if (description !== undefined && typeof description !== "string") {
      return res.status(400).json({ error: "description must be a string" });
    }
    if (genre !== undefined && typeof genre !== "string") {
      return res.status(400).json({ error: "genre must be a string" });
    }
    if (content !== undefined && typeof content !== "string") {
      return res.status(400).json({ error: "content must be a string" });
    }

    if (title !== undefined) project.title = title;
    if (description !== undefined) project.description = description;
    if (genre !== undefined) project.genre = genre;
    if (content !== undefined) {
      project.content = content;
      project.wordCount = countPlainWords(content);
    }
    if (storyBible !== undefined) {
      project.storyBible = storyBible;
    }

    project.updatedAt = new Date().toISOString();
    deps.persistProjects();

    res.json(project);
  });

  app.delete("/api/projects/:id", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id");
    const deleted = deps.projects.delete(req.params.id);
    if (deleted) {
      deps.persistProjects();
    }
    res.json({ deleted });
  });

  app.get("/api/projects/:id/chapters", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id/chapters");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project.chapters);
  });

  app.post("/api/projects/:id/chapters", (req: Request, res: Response) => {
    deps.trackRequest("/api/projects/:id/chapters");
    const project = deps.projects.get(req.params.id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const chapter = createChapter(
      req.body.title || `Chapter ${project.chapters.length + 1}`,
      project.chapters.length,
    );
    project.chapters.push(chapter);
    project.updatedAt = new Date().toISOString();
    deps.persistProjects();

    res.json(chapter);
  });

  app.put(
    "/api/projects/:projectId/chapters/:chapterId",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:projectId/chapters/:chapterId");
      const project = deps.projects.get(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const chapter = project.chapters.find(
        (item) => item.id === req.params.chapterId,
      );
      if (!chapter) {
        return res.status(404).json({ error: "Chapter not found" });
      }

      if (req.body.title !== undefined) chapter.title = req.body.title;
      if (req.body.content !== undefined) {
        chapter.content = req.body.content;
        chapter.wordCount = countPlainWords(req.body.content);
      }
      if (req.body.order !== undefined) chapter.order = req.body.order;

      rebuildProjectTotals(project);
      deps.persistProjects();

      res.json(chapter);
    },
  );

  app.delete(
    "/api/projects/:projectId/chapters/:chapterId",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:projectId/chapters/:chapterId");
      const project = deps.projects.get(req.params.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const index = project.chapters.findIndex(
        (item) => item.id === req.params.chapterId,
      );
      if (index === -1) {
        return res.status(404).json({ error: "Chapter not found" });
      }

      project.chapters.splice(index, 1);
      project.chapters.forEach((chapter, order) => {
        chapter.order = order;
      });

      rebuildProjectTotals(project);
      deps.persistProjects();

      res.json({ deleted: true });
    },
  );

  app.post(
    "/api/projects/:id/cleanup-chapters",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:id/cleanup-chapters");
      const project = deps.projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const minWords = req.body.minWords || 10;
      const keepFirst = req.body.keepFirst !== false;
      const before = project.chapters.length;
      const removed: string[] = [];

      project.chapters = project.chapters.filter((chapter, index) => {
        if (keepFirst && index === 0) return true;
        if (chapter.wordCount >= minWords) return true;
        removed.push(chapter.title);
        return false;
      });

      project.chapters.forEach((chapter, index) => {
        chapter.order = index;
      });
      rebuildProjectTotals(project);
      deps.persistProjects();

      deps.logger.info("Cleaned up empty chapters", {
        projectId: project.id,
        before,
        after: project.chapters.length,
        removed: removed.length,
      });

      res.json({
        before,
        after: project.chapters.length,
        removed,
        remaining: project.chapters.map((chapter) => ({
          title: chapter.title,
          wordCount: chapter.wordCount,
        })),
      });
    },
  );

  app.post(
    "/api/projects/:id/prepare-book-mode",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/projects/:id/prepare-book-mode");
      const project = deps.projects.get(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const targetCount =
        req.body.targetChapters ||
        project.storyBible?.chapterOutlines?.length ||
        10;
      let created = 0;

      if (project.chapters.length < targetCount) {
        for (
          let index = project.chapters.length;
          index < targetCount;
          index++
        ) {
          const outline = project.storyBible?.chapterOutlines?.[index];
          project.chapters.push(
            createChapter(outline?.title || `Chapter ${index + 1}`, index),
          );
          created++;
        }

        project.updatedAt = new Date().toISOString();
        deps.persistProjects();
        deps.logger.info(`Prepared ${targetCount} chapters for book mode`, {
          projectId: project.id,
        });
      }

      res.json({
        chapters: project.chapters,
        created,
      });
    },
  );

  app.post("/api/chapters/:chapterId/save", (req: Request, res: Response) => {
    deps.trackRequest("/api/chapters/:chapterId/save");
    const { chapterId } = req.params;
    const { content, trigger, generationDraftId } = req.body;

    if (!content && content !== "") {
      return res.status(400).json({ error: "Content required" });
    }
    if (
      generationDraftId !== undefined &&
      typeof generationDraftId !== "string"
    ) {
      return res
        .status(400)
        .json({ error: "generationDraftId must be a string" });
    }

    const wordCount = countPlainWords(content);
    const validTriggers = [
      "sentence_end",
      "paragraph",
      "word_boundary",
      "idle",
      "manual",
      "pagehide",
      "generation",
      "accepted_generation",
      "auto_accepted_generation",
      "auto_accepted_generation_retry",
      "paste",
      "recovered_local_draft",
    ];
    const saveTrigger = validTriggers.includes(trigger) ? trigger : "manual";

    try {
      let projectId: string | null = null;
      let chapterTitle = "Untitled";
      let chapterOrder = 0;

      for (const [candidateProjectId, project] of deps.projects.entries()) {
        const chapter = project.chapters.find((item) => item.id === chapterId);
        if (!chapter) continue;

        projectId = candidateProjectId;
        chapterTitle = chapter.title;
        chapterOrder = chapter.order;
        chapter.content = content;
        chapter.wordCount = wordCount;
        rebuildProjectTotals(project);
        break;
      }

      if (projectId) {
        const project = deps.projects.get(projectId);
        const dbProject = deps.db.getProject(projectId);
        if (!dbProject && project) {
          deps.db.saveProject({
            id: projectId,
            title: project.title,
            content: project.content,
            storyBible: project.storyBible,
            wordCount: project.wordCount,
          });
        }

        const dbChapter = deps.db.getChapter(chapterId);
        if (!dbChapter) {
          deps.db.saveChapter({
            id: chapterId,
            projectId,
            title: chapterTitle,
            content,
            wordCount,
            sortOrder: chapterOrder,
          });
        }
      }

      deps.db.saveChapterWithHistory({
        chapterId,
        content,
        wordCount,
        trigger: saveTrigger,
      });

      if (generationDraftId) {
        deps.db.resolveGeneratedDraft(generationDraftId, "persisted");
      }

      if (
        projectId &&
        (saveTrigger === "accepted_generation" ||
          saveTrigger === "auto_accepted_generation" ||
          saveTrigger === "auto_accepted_generation_retry" ||
          saveTrigger === "manual" ||
          saveTrigger === "paste")
      ) {
        const project = deps.projects.get(projectId);
        if (project) {
          const liveMemory = deps.getLifetimeMemory?.();
          if (!liveMemory) {
            deps.persistProjects();
            return res.json({ saved: true, wordCount, trigger: saveTrigger });
          }
          recordProjectMemoryFromChapterSave({
            memory: liveMemory,
            project,
            chapterId,
            content,
            trigger: saveTrigger,
          });
          deps.refreshLifetimeInsights?.();
          deps.persistLifetimeMemory?.();
        }
      }

      deps.persistProjects();
      res.json({ saved: true, wordCount, trigger: saveTrigger });
    } catch (error) {
      deps.logger.error("Ironclad save failed", {
        chapterId,
        error: String(error),
      });
      res.status(500).json({ error: "Save failed" });
    }
  });

  app.get("/api/chapters/:chapterId/history", (req: Request, res: Response) => {
    deps.trackRequest("/api/chapters/:chapterId/history");
    const { chapterId } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 50;

    try {
      const history = deps.db.getChapterHistory(chapterId, limit);
      res.json(history);
    } catch (error) {
      deps.logger.error("Failed to get chapter history", {
        chapterId,
        error: String(error),
      });
      res.status(500).json({ error: "Failed to get history" });
    }
  });

  app.post(
    "/api/chapters/:chapterId/restore/:versionId",
    (req: Request, res: Response) => {
      deps.trackRequest("/api/chapters/:chapterId/restore/:versionId");
      const { chapterId, versionId } = req.params;

      try {
        deps.db.restoreChapterVersion(chapterId, parseInt(versionId, 10));
        const restored = deps.db.getChapter(chapterId);

        if (restored) {
          for (const project of deps.projects.values()) {
            const chapter = project.chapters.find(
              (item) => item.id === chapterId,
            );
            if (!chapter) continue;

            chapter.content = restored.content;
            chapter.wordCount = restored.word_count;
            rebuildProjectTotals(project);
            deps.persistProjects();
            break;
          }
        }

        res.json({ restored: true, versionId: parseInt(versionId, 10) });
      } catch (error) {
        deps.logger.error("Failed to restore version", {
          chapterId,
          versionId,
          error: String(error),
        });
        res.status(500).json({ error: "Failed to restore" });
      }
    },
  );

  app.get("/api/db/health", (_req: Request, res: Response) => {
    deps.trackRequest("/api/db/health");
    res.json(deps.db.checkDatabaseHealth());
  });
}
