import JSZip from 'jszip';

export class ZipBuilder {
  constructor() {
    this.zip = new JSZip();
  }

  addMarkdown(path, content) {
    // Ensure .md extension
    const mdPath = path.endsWith('.md') ? path : path.replace(/\.[^.]+$/, '.md');
    this.zip.file(mdPath, content);
  }

  addImage(path, data) {
    this.zip.file(path, data);
  }

  addFile(path, data) {
    this.zip.file(path, data);
  }

  async generate() {
    return this.zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }
}
