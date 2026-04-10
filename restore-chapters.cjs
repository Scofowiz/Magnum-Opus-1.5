const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = process.env.MAGNUM_OPUS_DATA_DIR || path.join(process.cwd(), '.novawrite-data');
const db = new Database(path.join(dataDir, 'novawrite.db'));
const projectsPath = path.join(dataDir, 'projects.json');
const projects = JSON.parse(fs.readFileSync(projectsPath, 'utf8'));

// Get all restored chapters from SQLite
const chapters = db.prepare(`
  SELECT c.id, c.project_id, c.content, c.word_count, c.title
  FROM chapters c
  WHERE c.id IN (SELECT DISTINCT chapter_id FROM chapter_versions WHERE trigger='autonomous')
    AND c.content IS NOT NULL AND length(c.content) > 100
`).all();

console.log('Found', chapters.length, 'chapters to restore');

let restored = 0;
for (const ch of chapters) {
  const proj = projects[ch.project_id];
  if (proj && proj.chapters) {
    const chap = proj.chapters.find(c => c.id === ch.id);
    if (chap) {
      chap.content = ch.content;
      chap.wordCount = ch.word_count || ch.content.split(/\s+/).filter(Boolean).length;
      restored++;
      console.log('Restored:', ch.title, '-', ch.word_count, 'words');
    }
  }
}

// Recalculate project word counts
for (const id in projects) {
  const proj = projects[id];
  if (proj.chapters) {
    proj.wordCount = proj.chapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  }
}

fs.writeFileSync(projectsPath, JSON.stringify(projects, null, 2));
console.log('Restored', restored, 'chapters to projects.json');
db.close();
