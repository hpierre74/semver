import { BuilderContext } from '@angular-devkit/architect';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import * as rimraf from 'rimraf';
import * as tmp from 'tmp';
import { promisify } from 'util';

export interface TestingWorkspace {
  tearDown(): Promise<void>;
  root: string;
}

export function setupTestingWorkspace(
  files: Map<string, string>
): TestingWorkspace {
  /* Create a temporary directory. */
  const tmpDir = tmp.dirSync();

  for (const [fileRelativePath, content] of files.entries()) {
    const filePath = resolve(tmpDir.name, fileRelativePath);
    const directory = dirname(filePath);
    /* Create path. */
    mkdirSync(directory, { recursive: true });
    /* Create file. */
    writeFileSync(filePath, content, 'utf-8');
  }

  const originalCwd = process.cwd();
  process.chdir(tmpDir.name);

  /* Retrieving path from `process.cwd()`
   * because for some strange reasons it returns a different value.
   * Cf. https://github.com/nodejs/node/issues/7545 */
  const workspaceRoot = process.cwd();

  return {
    /**
     * Destroy and restore cwd.
     */
    async tearDown() {
      await promisify(rimraf)(workspaceRoot);
      process.chdir(originalCwd);
    },
    root: workspaceRoot,
  };
}

export function createFakeContext({
  project,
  projectRoot,
  workspaceRoot,
}: {
  project: string;
  projectRoot: string;
  workspaceRoot: string;
}): BuilderContext {
  return {
    getProjectMetadata: jest.fn().mockReturnValue({ root: projectRoot }),
    getTargetOptions: jest.fn().mockResolvedValue({ outputPath: `dist/packages/${project}` }),
    logger: { error: jest.fn(), info: jest.fn() },
    reportStatus: jest.fn(),
    target: {
      project,
    },
    workspaceRoot,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  } as any;
}
