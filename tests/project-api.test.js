import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createApp } from "../src/server/app.js";
import { SqliteProjectRepository } from "../src/repositories/project-repository.js";

const execFileAsync = promisify(execFile);

test("registers a project, lists it, and returns live detail and repo status", async () => {
  const fixture = await makeTempDir("eat-project-api-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const repo = await createRepository(fixture.path, "registered-repo", { defaultBranch: "main" });
    const server = await startServer({ databasePath });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });

      assert.equal(registerResponse.status, 201);
      assert.equal(registerResponse.body.project.name, "registered-repo");
      assert.equal(registerResponse.body.project.defaultBranch, "main");
      assert.equal(registerResponse.body.repoStatus.currentBranch, "main");
      assert.equal(registerResponse.body.repoStatus.isDirty, false);

      await writeFile(path.join(repo.repoPath, "dirty.txt"), "dirty\n", "utf8");

      const listResponse = await requestJson(server, "/api/projects");
      assert.equal(listResponse.status, 200);
      assert.equal(listResponse.body.projects.length, 1);
      assert.equal(listResponse.body.projects[0].path, repo.repoPath);

      const detailResponse = await requestJson(server, `/api/projects/${registerResponse.body.project.id}`);
      assert.equal(detailResponse.status, 200);
      assert.equal(detailResponse.body.project.id, registerResponse.body.project.id);
      assert.equal(detailResponse.body.repoStatus.isDirty, true);

      const repoStatusResponse = await requestJson(
        server,
        `/api/projects/${registerResponse.body.project.id}/repo-status`,
      );
      assert.equal(repoStatusResponse.status, 200);
      assert.equal(repoStatusResponse.body.projectId, registerResponse.body.project.id);
      assert.equal(repoStatusResponse.body.repoStatus.currentBranch, "main");
      assert.equal(repoStatusResponse.body.repoStatus.isDirty, true);
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("returns structured errors for duplicate registration and invalid repositories", async () => {
  const fixture = await makeTempDir("eat-project-api-errors-");

  try {
    const repository = new SqliteProjectRepository({
      databasePath: path.join(fixture.path, "data", "eat.db"),
    });
    const repo = await createRepository(fixture.path, "duplicate-repo", { defaultBranch: "main" });
    const server = await startServer({ projectRepository: repository });

    try {
      const firstResponse = await requestJson(server, "/api/projects", {
        body: { path: `${repo.repoPath}${path.sep}.` },
        method: "POST",
      });
      assert.equal(firstResponse.status, 201);

      const duplicateResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      assert.equal(duplicateResponse.status, 409);
      assert.equal(duplicateResponse.body.error.code, "PROJECT_ALREADY_REGISTERED");

      const invalidPathResponse = await requestJson(server, "/api/projects", {
        body: { path: path.join(fixture.path, "missing-repo") },
        method: "POST",
      });
      assert.equal(invalidPathResponse.status, 400);
      assert.equal(invalidPathResponse.body.error.code, "PATH_NOT_FOUND");

      const notFoundResponse = await requestJson(server, "/api/projects/does-not-exist");
      assert.equal(notFoundResponse.status, 404);
      assert.equal(notFoundResponse.body.error.code, "PROJECT_NOT_FOUND");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("rejects duplicate registration when the same repository is submitted through a symlink", async () => {
  const fixture = await makeTempDir("eat-project-api-symlink-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const repo = await createRepository(fixture.path, "canonical-repo", { defaultBranch: "main" });
    const aliasPath = path.join(fixture.path, "repo-alias");
    const server = await startServer({ databasePath });

    await symlink(repo.repoPath, aliasPath);

    try {
      const firstResponse = await requestJson(server, "/api/projects", {
        body: { path: aliasPath },
        method: "POST",
      });
      assert.equal(firstResponse.status, 201);
      assert.equal(firstResponse.body.project.path, repo.repoPath);

      const duplicateResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      assert.equal(duplicateResponse.status, 409);
      assert.equal(duplicateResponse.body.error.code, "PROJECT_ALREADY_REGISTERED");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("returns structured validation errors when a registered repository becomes unavailable", async () => {
  const fixture = await makeTempDir("eat-project-api-stale-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const repo = await createRepository(fixture.path, "stale-repo", { defaultBranch: "main" });
    const server = await startServer({ databasePath });

    try {
      const registerResponse = await requestJson(server, "/api/projects", {
        body: { path: repo.repoPath },
        method: "POST",
      });
      assert.equal(registerResponse.status, 201);

      await rm(repo.repoPath, { force: true, recursive: true });

      const detailResponse = await requestJson(server, `/api/projects/${registerResponse.body.project.id}`);
      assert.equal(detailResponse.status, 400);
      assert.equal(detailResponse.body.error.code, "PATH_NOT_FOUND");

      const repoStatusResponse = await requestJson(
        server,
        `/api/projects/${registerResponse.body.project.id}/repo-status`,
      );
      assert.equal(repoStatusResponse.status, 400);
      assert.equal(repoStatusResponse.body.error.code, "PATH_NOT_FOUND");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

test("browses directories for the project picker and supports hidden-directory toggles", async () => {
  const fixture = await makeTempDir("eat-project-browse-");

  try {
    const databasePath = path.join(fixture.path, "data", "eat.db");
    const repo = await createRepository(fixture.path, "browse-repo", { defaultBranch: "main" });
    const plainDirectory = path.join(fixture.path, "plain-dir");
    const hiddenDirectory = path.join(fixture.path, ".hidden-dir");
    const server = await startServer({ databasePath });

    await mkdir(plainDirectory);
    await mkdir(hiddenDirectory);

    try {
      const browseResponse = await requestJson(
        server,
        `/api/projects/browse?path=${encodeURIComponent(fixture.path)}`,
      );
      assert.equal(browseResponse.status, 200);
      assert.equal(browseResponse.body.currentPath, fixture.path);
      assert.equal(browseResponse.body.parentPath, path.dirname(fixture.path));
      assert.ok(Array.isArray(browseResponse.body.roots));
      assert.ok(browseResponse.body.roots.some((root) => root.kind === "root"));
      assert.deepEqual(
        browseResponse.body.entries.map((entry) => entry.name),
        ["browse-repo", "plain-dir"],
      );
      assert.equal(browseResponse.body.entries[0].isGitRepository, true);

      const hiddenBrowseResponse = await requestJson(
        server,
        `/api/projects/browse?path=${encodeURIComponent(fixture.path)}&hidden=1`,
      );
      assert.equal(hiddenBrowseResponse.status, 200);
      assert.ok(hiddenBrowseResponse.body.entries.some((entry) => entry.name === ".hidden-dir"));

      const invalidBrowseResponse = await requestJson(
        server,
        `/api/projects/browse?path=${encodeURIComponent(path.join(fixture.path, "missing"))}`,
      );
      assert.equal(invalidBrowseResponse.status, 400);
      assert.equal(invalidBrowseResponse.body.error.code, "PATH_NOT_FOUND");
    } finally {
      await stopServer(server);
    }
  } finally {
    await fixture.dispose();
  }
});

async function startServer(options = {}) {
  const server = createApp({
    ...(options.projectRepository
      ? { projectRepository: options.projectRepository }
      : {
          repositoryOptions: {
            databasePath: options.databasePath,
          },
        }),
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  return server;
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function requestJson(server, routePath, options = {}) {
  const address = server.address();
  const url = new URL(routePath, `http://127.0.0.1:${address.port}`);
  const requestBody = options.body ? JSON.stringify(options.body) : undefined;

  const response = await fetch(url, {
    body: requestBody,
    headers: requestBody ? { "content-type": "application/json" } : undefined,
    method: options.method ?? "GET",
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function createRepository(rootPath, name, options = {}) {
  const repoPath = path.join(rootPath, name);
  const defaultBranch = options.defaultBranch ?? "main";

  await mkdir(repoPath);
  await runGit(rootPath, ["init", `--initial-branch=${defaultBranch}`, repoPath]);
  await configureGitIdentity(repoPath);
  await commitFile(repoPath, "README.md", "seed\n");

  return {
    repoPath,
    defaultBranch,
  };
}

async function commitFile(repoPath, fileName, content) {
  await writeFile(path.join(repoPath, fileName), content, "utf8");
  await runGit(repoPath, ["add", fileName]);
  await runGit(repoPath, ["commit", "-m", `add ${fileName}`]);
}

async function configureGitIdentity(repoPath) {
  await runGit(repoPath, ["config", "user.name", "EAT Test"]);
  await runGit(repoPath, ["config", "user.email", "eat@example.com"]);
}

async function runGit(cwd, args) {
  await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
  });
}

async function makeTempDir(prefix) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    async dispose() {
      await rm(tempDir, { force: true, recursive: true });
    },
    path: tempDir,
  };
}
