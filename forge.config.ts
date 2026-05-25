import type { ForgeConfig } from '@electron-forge/shared-types';
import path from 'node:path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/node_modules/@9b9387/android-stream-scrcpy/assets/scrcpy-server-v4.0.jar',
    },
    icon: path.join(__dirname, 'assets/icon'),
    extendInfo: {
      NSMicrophoneUsageDescription: 'This app requires microphone access to send your voice to Gemini Live.',
      NSCameraUsageDescription: 'This app requires camera access to capture the video feed.',
    },
  },
  rebuildConfig: {
    onlyModules: ['sqlite3'],
  },
  hooks: {
    packageAfterCopy: async (config, buildPath, electronVersion, platform, arch) => {
      const fs = require('node:fs');
      const path = require('node:path');
      const { execSync } = require('node:child_process');

      console.log(`\n[Hook] packageAfterCopy: files in buildPath:`, fs.readdirSync(buildPath));

      const pkgSrc = path.join(__dirname, 'package.json');
      const pkgDest = path.join(buildPath, 'package.json');
      if (fs.existsSync(pkgSrc)) {
        fs.copyFileSync(pkgSrc, pkgDest);
      }

      const lockSrc = path.join(__dirname, 'package-lock.json');
      const lockDest = path.join(buildPath, 'package-lock.json');
      if (fs.existsSync(lockSrc)) {
        fs.copyFileSync(lockSrc, lockDest);
      }

      try {
        console.log(`[Hook] packageAfterCopy: Installing production dependencies in ${buildPath}...`);
        execSync('npm install --omit=dev --no-audit --no-fund', {
          cwd: buildPath,
          stdio: 'inherit',
        });
        console.log('[Hook] packageAfterCopy: Production dependencies installed successfully.\n');
      } catch (err) {
        console.error('[Hook] packageAfterCopy: Failed to install production dependencies:', err);
        throw err;
      }
    },
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
