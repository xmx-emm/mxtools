import {describe, expect, it} from 'vitest';

import {
    parseNetstatPortOwners,
    selectStaleProjectProcessIds,
} from './tauri-dev.mjs';

describe('tauri dev process cleanup', () => {
    it('selects only the stale project process tree', () => {
        const projectRoot = String.raw`X:\fixtures\mxtools`;
        const processes = [
            {ProcessId: 10, ParentProcessId: 1, Name: 'cmd.exe'},
            {
                ProcessId: 11,
                ParentProcessId: 10,
                Name: 'node.exe',
                CommandLine: String.raw`node ${projectRoot}\node_modules\@tauri-apps\cli\tauri.js dev`,
            },
            {ProcessId: 12, ParentProcessId: 11, Name: 'cargo.exe'},
            {
                ProcessId: 13,
                ParentProcessId: 12,
                Name: 'mxtools.exe',
                ExecutablePath: String.raw`${projectRoot}\src-tauri\target\debug\mxtools.exe`,
            },
            {
                ProcessId: 20,
                ParentProcessId: 1,
                Name: 'node.exe',
                CommandLine: String.raw`node X:\fixtures\other\node_modules\vite\bin\vite.js`,
            },
            {ProcessId: 30, ParentProcessId: 1, Name: 'cmd.exe'},
            {
                ProcessId: 31,
                ParentProcessId: 30,
                Name: 'node.exe',
                CommandLine: String.raw`node ${projectRoot}\scripts\tauri-dev.mjs`,
            },
        ];

        expect(selectStaleProjectProcessIds(
            processes,
            projectRoot,
            31,
        )).toEqual([10, 11, 12, 13]);
    });

    it('recognizes Vite launched through the local npm bin shim', () => {
        const projectRoot = String.raw`X:\fixtures\mxtools`;
        const processes = [
            {
                ProcessId: 42,
                ParentProcessId: 41,
                Name: 'node.exe',
                CommandLine: String.raw`"node" "${projectRoot}\node_modules\.bin\\..\vite\bin\vite.js" --host 127.0.0.1`,
            },
            {ProcessId: 41, ParentProcessId: 40, Name: 'cmd.exe'},
            {ProcessId: 40, ParentProcessId: 1, Name: 'node.exe'},
        ];

        expect(selectStaleProjectProcessIds(
            processes,
            projectRoot,
            999,
        )).toEqual([40, 41, 42]);
    });

    it('parses a listener from netstat when TCP cmdlets hide it', () => {
        const output = [
            '  TCP    127.0.0.1:14200        0.0.0.0:0        LISTENING       56604',
            '  TCP    0.0.0.0:14200          0.0.0.0:0        LISTENING       56604',
            '  TCP    127.0.0.1:5173         0.0.0.0:0        LISTENING       1234',
        ].join('\n');

        expect(parseNetstatPortOwners(output)).toEqual([56604]);
    });
});
