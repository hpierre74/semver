import { BuilderContext } from '@angular-devkit/architect';
import { Observable, of } from 'rxjs';

import { SemanticReleasePluginAdapter } from './plugin-adapter';
import { createFakeContext } from './testing';
import { readJsonFile } from './utils/filesystem';
import { CommonVersionOptions } from './version';

jest.mock('./utils/filesystem');

describe('SemanticPluginAdapter', () => {
  const options: CommonVersionOptions = {
    dryRun: false,
    noVerify: false,
    newVersion: '0.0.1',
    preset: 'angular',
    projectRoot: '/root/packages/lib',
    tagPrefix: 'v',
  };

  let context: BuilderContext;

  const semanticPluginSpy = { publish: jest.fn(), addChannel: jest.fn() };

  beforeEach(() => {
    context = createFakeContext({
      project: 'lib',
      projectRoot: '/root/packages/lib',
      workspaceRoot: '/root',
    });

    (context.getTargetOptions as jest.Mock).mockResolvedValue({
      outputPath: 'dist/packages/lib',
    });

    (readJsonFile as jest.Mock).mockReturnValue(
      of({ name: '@my-package', version: '0.0.0' })
    );

    semanticPluginSpy.publish.mockResolvedValue('');
    semanticPluginSpy.addChannel.mockResolvedValue('');
  });

  it(`should call semantic-release 'addChannel' and 'publish' hooks`, async () => {
    const plugin = SemanticReleasePluginAdapter.adapt(
      '@semantic-release/npm',
      semanticPluginSpy
    );

    await (plugin.publish(
      {},
      options,
      context
    ) as Observable<unknown>).toPromise();

    expect(semanticPluginSpy.addChannel).toBeCalled();
    expect(semanticPluginSpy.publish).toBeCalled();
    expect(semanticPluginSpy.addChannel).toHaveBeenCalledBefore(
      semanticPluginSpy.publish
    );
  });

  it(`should call semantic-release 'publish' hook with right options`, async () => {
    const plugin = SemanticReleasePluginAdapter.adapt(
      '@semantic-release/npm',
      semanticPluginSpy
    );

    await (plugin.publish(
      {},
      options,
      context
    ) as Observable<unknown>).toPromise();

    expect(semanticPluginSpy.publish).toBeCalledWith(
      '/root/.npmrc',
      expect.objectContaining({
        npmPublish: true,
        pkgRoot: '/root/dist/packages/lib',
      }),
      expect.objectContaining({ name: '@my-package', version: '0.0.0' }),
      expect.objectContaining({
        cwd: '/root/packages/lib',
        env: expect.any(Object),
        stderr: expect.anything(),
        stdout: expect.anything(),
        logger: expect.objectContaining({
          log: expect.any(Function),
        }),
        nextRelease: expect.objectContaining({
          version: '0.0.1', // @todo test dist tag / channel
        }),
      })
    );
  });

  it(`should call semantic-release 'addChannel' hook with right options`, async () => {
    const plugin = SemanticReleasePluginAdapter.adapt(
      '@semantic-release/npm',
      semanticPluginSpy
    );

    await (plugin.publish(
      {},
      options,
      context
    ) as Observable<unknown>).toPromise();

    expect(semanticPluginSpy.addChannel).toBeCalledWith(
      '/root/.npmrc',
      expect.objectContaining({
        pkgRoot: '/root/dist/packages/lib',
        npmPublish: true,
      }),
      expect.objectContaining({ name: '@my-package', version: '0.0.0' }),
      expect.objectContaining({
        cwd: '/root/packages/lib',
        env: expect.any(Object),
        stderr: expect.anything(),
        stdout: expect.anything(),
        logger: expect.objectContaining({
          log: expect.any(Function),
        }),
        nextRelease: expect.objectContaining({
          version: '0.0.1', // @todo test dist tag / channel
        }),
      })
    );
  });
});
