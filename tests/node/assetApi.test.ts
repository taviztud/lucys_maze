import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTrustedWriteRequest, resolveWritableAssetPath } from '../../scripts/plugins/vite-asset-api';

const ROOT = path.resolve('/project');

describe('resolveWritableAssetPath', () => {
    it('accepts files inside the writable folders', () => {
        expect(resolveWritableAssetPath(ROOT, 'public/hero.png')).toBe(path.join(ROOT, 'public', 'hero.png'));
        expect(resolveWritableAssetPath(ROOT, 'src/assets/sprites/enemies/worm.json'))
            .toBe(path.join(ROOT, 'src', 'assets', 'sprites', 'enemies', 'worm.json'));
        expect(resolveWritableAssetPath(ROOT, 'src\\assets\\sprites\\player\\lucy.json'))
            .toBe(path.join(ROOT, 'src', 'assets', 'sprites', 'player', 'lucy.json'));
    });

    it('rejects paths that climb out of a writable folder', () => {
        for (const target of [
            'public/../vite.config.ts',
            'public/../package.json',
            'src/assets/sprites/../../main.ts',
            'src/assets/sprites/../audio/bg/track.mp3',
            'public/../../outside.txt',
            '../outside.txt'
        ]) {
            expect(resolveWritableAssetPath(ROOT, target), target).toBeNull();
        }
    });

    it('rejects other folders, the folders themselves, absolute paths and non-strings', () => {
        expect(resolveWritableAssetPath(ROOT, 'src/main.ts')).toBeNull();
        expect(resolveWritableAssetPath(ROOT, 'publicity/file.png')).toBeNull();
        expect(resolveWritableAssetPath(ROOT, 'public')).toBeNull();
        expect(resolveWritableAssetPath(ROOT, path.join(ROOT, 'public', 'hero.png'))).toBeNull();
        expect(resolveWritableAssetPath(ROOT, undefined)).toBeNull();
        expect(resolveWritableAssetPath(ROOT, 42)).toBeNull();
    });
});

describe('isTrustedWriteRequest', () => {
    const base = { host: 'localhost:8080', 'content-type': 'application/json' };

    it('accepts JSON requests from the same origin', () => {
        expect(isTrustedWriteRequest({ headers: { ...base, origin: 'http://localhost:8080' } })).toBe(true);
        expect(isTrustedWriteRequest({ headers: { ...base, 'sec-fetch-site': 'same-origin' } })).toBe(true);
        expect(isTrustedWriteRequest({ headers: base })).toBe(true);
    });

    it('rejects requests that a web page can send without a CORS preflight', () => {
        expect(isTrustedWriteRequest({ headers: { ...base, 'content-type': 'text/plain' } })).toBe(false);
        expect(isTrustedWriteRequest({ headers: { host: base.host } })).toBe(false);
    });

    it('rejects other origins', () => {
        expect(isTrustedWriteRequest({ headers: { ...base, origin: 'https://evil.example' } })).toBe(false);
        expect(isTrustedWriteRequest({ headers: { ...base, origin: 'http://localhost:9999' } })).toBe(false);
        expect(isTrustedWriteRequest({ headers: { ...base, 'sec-fetch-site': 'cross-site' } })).toBe(false);
        expect(isTrustedWriteRequest({ headers: { ...base, origin: 'not a url' } })).toBe(false);
    });
});
