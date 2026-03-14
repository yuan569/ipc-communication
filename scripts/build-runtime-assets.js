const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = path.join(projectRoot, 'dist-runtime');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectory(sourceDir, targetDir) {
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    copyFile(sourcePath, targetPath);
  }
}

function buildRuntimeAssets() {
  // 每次都重建运行时目录，避免旧资源残留导致“代码已改、页面未更新”的错觉。
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  ensureDir(runtimeRoot);

  // renderer 保持原有目录结构，避免 HTML 中大量相对路径需要同步调整。
  copyDirectory(
    path.join(projectRoot, 'renderer'),
    path.join(runtimeRoot, 'renderer')
  );

  // UMD 客户端单独拷贝到 runtime，供静态 HTML 直接通过 script 标签加载。
  copyDirectory(
    path.join(projectRoot, 'dist-umd'),
    path.join(runtimeRoot, 'dist-umd')
  );

  // preload 也复制到运行时目录，主进程就可以优先从统一产物加载。
  copyFile(
    path.join(projectRoot, 'event-bus-client', 'preload.js'),
    path.join(runtimeRoot, 'event-bus-client', 'preload.js')
  );
}

buildRuntimeAssets();
