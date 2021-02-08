import { BuilderContext } from '@angular-devkit/architect';
import * as lernaChildProcess from '@lerna/child-process';
import { execFile } from 'child_process';
import { of } from 'rxjs';
import * as standardVersion from 'standard-version';
import * as changelog from 'standard-version/lib/lifecycles/changelog';
import { callbackify } from 'util';
import { runBuilder } from './builder';
import { VersionBuilderSchema } from './schema';
import { createFakeContext } from './testing';
import { tryBump } from './utils/try-bump';
import * as workspace from './utils/workspace';
import { getPackageFiles, getProjectRoots } from './utils/workspace';

/* eslint-disable @typescript-eslint/no-var-requires */
const { publish } = require('@custom-plugin/npm');
/* eslint-enable @typescript-eslint/no-var-requires */

jest.mock(
  '@custom-plugin/npm',
  () => ({ publish: jest.fn(), type: '@jscutlery/semver-plugin' }),
  {
    virtual: true,
  }
);

jest.mock('child_process');
jest.mock('@lerna/child-process');
jest.mock('standard-version', () => jest.fn());
jest.mock('standard-version/lib/lifecycles/changelog', () => jest.fn());

jest.mock('./utils/try-bump');

describe('@jscutlery/semver:version', () => {
  const mockChangelog = changelog as jest.Mock;
  const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;
  const mockStandardVersion = standardVersion as jest.MockedFunction<
    typeof standardVersion
  >;
  const mockTryBump = tryBump as jest.MockedFunction<typeof tryBump>;

  let context: BuilderContext;

  const options: VersionBuilderSchema = {
    dryRun: false,
    noVerify: false,
    push: false,
    remote: 'origin',
    baseBranch: 'main',
    syncVersions: false,
    rootChangelog: true,
    plugins: [],
  };

  beforeEach(() => {
    context = createFakeContext({
      project: 'a',
      projectRoot: '/root/packages/a',
      workspaceRoot: '/root',
    });

    mockChangelog.mockResolvedValue(undefined);
    mockTryBump.mockReturnValue(of('2.1.0'));

    /* Mock standardVersion. */
    mockStandardVersion.mockResolvedValue(undefined);

    mockExecFile.mockImplementation(
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      callbackify(jest.fn().mockResolvedValue('')) as any
    );

    /* Mock console.info. */
    jest.spyOn(console, 'info').mockImplementation();

    /* Mock getPackageFiles. */
    jest
      .spyOn(workspace, 'getPackageFiles')
      .mockReturnValue(
        of(['/root/packages/a/package.json', '/root/packages/b/package.json'])
      );

    /* Mock getProjectRoots. */
    jest
      .spyOn(workspace, 'getProjectRoots')
      .mockReturnValue(of(['/root/packages/a', '/root/packages/b']));
  });

  afterEach(() => {
    (console.info as jest.Mock).mockRestore();
    (getPackageFiles as jest.Mock).mockRestore();
    (getProjectRoots as jest.Mock).mockRestore();
    mockChangelog.mockRestore();
    mockExecFile.mockRestore();
    mockStandardVersion.mockRestore();
    mockTryBump.mockRestore();
    publish.mockRestore();
  });

  it('should not push to Git by default', async () => {
    await runBuilder(options, context).toPromise();

    expect(lernaChildProcess.exec).not.toHaveBeenCalled();
  });

  it('should push to Git with right options', async () => {
    await runBuilder(
      { ...options, push: true, remote: 'origin', baseBranch: 'main' },
      context
    ).toPromise();

    expect(lernaChildProcess.exec).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining([
        'push',
        '--follow-tags',
        '--atomic',
        'origin',
        'main',
      ])
    );
  });

  it(`should push to Git and add '--no-verify' option when asked for`, async () => {
    await runBuilder(
      {
        ...options,
        push: true,
        noVerify: true,
      },
      context
    ).toPromise();

    expect(lernaChildProcess.exec).toHaveBeenCalledWith(
      'git',
      expect.arrayContaining([
        'push',
        '--follow-tags',
        '--no-verify',
        '--atomic',
        'origin',
        'main',
      ])
    );
  });

  it('should fail if Git config is missing', async () => {
    const { success } = await runBuilder(
      { ...options, push: true, remote: undefined, baseBranch: undefined },
      context
    ).toPromise();

    expect(success).toBe(false);
    expect(context.logger.error).toBeCalledWith(
      expect.stringContaining('Missing configuration')
    );
  });

  describe('Independent version', () => {
    it('should run standard-version independently on a project', async () => {
      const { success } = await runBuilder(options, context).toPromise();

      expect(success).toBe(true);
      expect(standardVersion).toBeCalledWith(
        expect.objectContaining({
          silent: false,
          preset: 'angular',
          dryRun: false,
          noVerify: false,
          tagPrefix: 'a-',
          path: '/root/packages/a',
          infile: '/root/packages/a/CHANGELOG.md',
          bumpFiles: ['/root/packages/a/package.json'],
          packageFiles: ['/root/packages/a/package.json'],
        })
      );
    });

    it('should not version if no commits since last release', async () => {
      mockTryBump.mockReturnValue(of(null));

      const { success } = await runBuilder(options, context).toPromise();

      expect(success).toBe(true);
      expect(console.info).toBeCalledWith(
        '⏹ nothing changed since last release'
      );
      expect(standardVersion).not.toBeCalled();
    });
  });

  describe('Sync versions', () => {
    beforeEach(() => {
      /* With the sync versions, the builder runs on the workspace. */
      context = createFakeContext({
        project: 'workspace',
        projectRoot: '/root',
        workspaceRoot: '/root',
      });
    });

    it('should run standard-version on multiple projects', async () => {
      const { success } = await runBuilder(
        {
          ...options,
          /* Enable sync versions. */
          syncVersions: true,
        },
        context
      ).toPromise();

      expect(success).toBe(true);
      expect(changelog).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          header: expect.any(String),
          dryRun: false,
          infile: '/root/packages/a/CHANGELOG.md',
        }),
        '2.1.0'
      );
      expect(changelog).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          header: expect.any(String),
          dryRun: false,
          infile: '/root/packages/b/CHANGELOG.md',
        }),
        '2.1.0'
      );

      expect(standardVersion).toBeCalledWith(
        expect.objectContaining({
          silent: false,
          preset: 'angular',
          dryRun: false,
          noVerify: false,
          path: '/root',
          infile: '/root/CHANGELOG.md',
          bumpFiles: [
            '/root/packages/a/package.json',
            '/root/packages/b/package.json',
          ],
          packageFiles: ['/root/package.json'],
          skip: {
            changelog: false,
          },
        })
      );
    });

    it('should generate root CHANGELOG only when requested', async () => {
      await runBuilder(
        {
          ...options,
          syncVersions: true,
          /* Disable root CHANGELOG */
          rootChangelog: false,
        },
        context
      ).toPromise();

      expect(standardVersion).toBeCalledWith(
        expect.objectContaining({
          skip: {
            changelog: true,
          },
        })
      );
    });

    it('should not version if no commits since last release', async () => {
      mockTryBump.mockReturnValue(of(null));

      const { success } = await runBuilder(
        {
          ...options,
          syncVersions: true,
        },
        context
      ).toPromise();

      expect(success).toBe(true);

      expect(console.info).toBeCalledWith(
        '⏹ nothing changed since last release'
      );
      expect(standardVersion).not.toBeCalled();
    });
  });

  describe('Plugins', () => {
    it('should publish with (--dry-run=false)', async () => {
      await runBuilder(
        { ...options, dryRun: false, plugins: ['@custom-plugin/npm'] },
        context
      ).toPromise();

      expect(publish).toBeCalled();
    });

    it('should not publish with (--dry-run=true)', async () => {
      await runBuilder(
        { ...options, dryRun: true, plugins: ['@custom-plugin/npm'] },
        context
      ).toPromise();

      expect(publish).not.toBeCalled();
    });

    it('should release before publishing', async () => {
      await runBuilder(
        { ...options, plugins: ['@custom-plugin/npm'] },
        context
      ).toPromise();

      expect(standardVersion).toHaveBeenCalledBefore(publish);
    });
  });
});
