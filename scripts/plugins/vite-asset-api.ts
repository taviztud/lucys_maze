import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage } from 'node:http';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Only these folders can be written through the API.
const WRITABLE_ROOTS = ['src/assets/sprites', 'public'];
// Large enough for a base64 sprite sheet, small enough to reject runaway bodies.
const MAX_BODY_BYTES = 32 * 1024 * 1024;

export function viteAssetApi(): Plugin {
    return {
        name: 'vite-asset-api',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                const url = new URL(req.url || '', `http://${req.headers.host}`);

                if (url.pathname === '/api/assets/list') {
                    try {
                        const rootDir = process.cwd();
                        const publicDir = path.join(rootDir, 'public');
                        const spritesDir = path.join(rootDir, 'src/assets/sprites');

                        const publicFiles = await safeReadDir(publicDir);
                        const spriteAssets = await scanSpriteAssets(spritesDir, rootDir);

                        const images = publicFiles
                            .filter(f => f.match(/\.(png|jpg|jpeg|webp)$/i))
                            .map(name => ({
                                name,
                                relativeUrl: `/${name}`,
                                storage: 'public',
                                targetPath: `public/${name}`
                            }));

                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            success: true,
                            images,
                            assets: spriteAssets
                        }));
                    } catch (error) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: (error as Error).message }));
                    }
                    return;
                }

                if (url.pathname === '/api/assets/save-json' && req.method === 'POST') {
                    if (!isTrustedWriteRequest(req)) {
                        res.statusCode = 403;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: 'Cross-site or non-JSON request rejected' }));
                        return;
                    }
                    try {
                        const body = await parseJsonBody(req);
                        const { targetPath, content } = body;
                        if (!targetPath || !content) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ success: false, error: 'Missing targetPath or content' }));
                            return;
                        }

                        const rootDir = process.cwd();
                        const resolvedPath = resolveWritableAssetPath(rootDir, targetPath);
                        if (!resolvedPath) {
                            res.statusCode = 403;
                            res.end(JSON.stringify({ success: false, error: 'Unauthorized path traversal' }));
                            return;
                        }

                        await mkdir(path.dirname(resolvedPath), { recursive: true });
                        const formatted = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
                        await writeFile(resolvedPath, `${formatted}\n`, 'utf8');

                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: true, savedPath: targetPath }));
                    } catch (error) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: (error as Error).message }));
                    }
                    return;
                }

                if (url.pathname === '/api/assets/save-sheet' && req.method === 'POST') {
                    if (!isTrustedWriteRequest(req)) {
                        res.statusCode = 403;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: 'Cross-site or non-JSON request rejected' }));
                        return;
                    }
                    try {
                        const body = await parseJsonBody(req);
                        const { targetPath, base64Data } = body;
                        if (!targetPath || typeof base64Data !== 'string' || !base64Data) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ success: false, error: 'Missing targetPath or base64Data' }));
                            return;
                        }

                        const rootDir = process.cwd();
                        const resolvedPath = resolveWritableAssetPath(rootDir, targetPath);
                        if (!resolvedPath) {
                            res.statusCode = 403;
                            res.end(JSON.stringify({ success: false, error: 'Unauthorized path traversal' }));
                            return;
                        }

                        const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
                        const buffer = Buffer.from(cleanBase64, 'base64');

                        await mkdir(path.dirname(resolvedPath), { recursive: true });
                        await writeFile(resolvedPath, buffer);

                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: true, savedPath: targetPath }));
                    } catch (error) {
                        res.statusCode = 500;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ success: false, error: (error as Error).message }));
                    }
                    return;
                }

                next();
            });
        }
    };
}

async function safeReadDir(dirPath: string): Promise<string[]> {
    try {
        return await readdir(dirPath);
    } catch {
        return [];
    }
}

interface SpritePair {
    id: string;
    name: string;
    category: string;
    imageUrl: string;
    jsonUrl?: string;
    targetImagePath: string;
    targetJsonPath?: string;
}

async function scanSpriteAssets(dirPath: string, rootDir: string): Promise<SpritePair[]> {
    const files = await scanFiles(dirPath);
    const groups = new Map<string, { png?: string; json?: string }>();
    for (const file of files) {
        const extension = path.extname(file).toLowerCase();
        if (extension !== '.png' && extension !== '.json') continue;
        const base = file.slice(0, -extension.length);
        const group = groups.get(base) ?? {};
        if (extension === '.png') group.png = file;
        else group.json = file;
        groups.set(base, group);
    }

    return [...groups.entries()]
        .filter(([, pair]) => pair.png)
        .map(([base, pair]) => {
            const relativeBase = path.relative(dirPath, base).split(path.sep).join('/');
            const category = relativeBase.split('/')[0] || 'tile';
            const targetImagePath = path.relative(rootDir, pair.png!).split(path.sep).join('/');
            const targetJsonPath = pair.json
                ? path.relative(rootDir, pair.json).split(path.sep).join('/')
                : undefined;
            return {
                id: relativeBase.replace(/[^a-z0-9_-]/gi, '_').toLowerCase(),
                name: path.basename(base),
                category,
                imageUrl: `/${targetImagePath}`,
                jsonUrl: targetJsonPath ? `/${targetJsonPath}` : undefined,
                targetImagePath,
                targetJsonPath
            };
        });
}

async function scanFiles(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) results.push(...await scanFiles(fullPath));
            else if (entry.isFile()) results.push(fullPath);
        }
    } catch {
        // Optional asset folders may not exist yet.
    }
    return results;
}

/**
 * Resolves a project-relative path and accepts it only when the resolved
 * location is inside one of the writable folders ("public/../x" is not).
 */
export function resolveWritableAssetPath(rootDir: string, targetPath: unknown): string | null {
    if (typeof targetPath !== 'string' || path.isAbsolute(targetPath)) return null;
    const resolved = path.resolve(rootDir, targetPath.replace(/\\/g, '/'));
    const isInsideWritableRoot = WRITABLE_ROOTS.some((root) => {
        const relative = path.relative(path.resolve(rootDir, root), resolved);
        return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    });
    return isInsideWritableRoot ? resolved : null;
}

/**
 * Writes are accepted only from Studio itself. Requiring a JSON content type
 * forces a CORS preflight for any other site, and the origin must be this server.
 */
export function isTrustedWriteRequest(req: Pick<IncomingMessage, 'headers'>): boolean {
    const { host, origin } = req.headers;
    const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
    if (!contentType.startsWith('application/json')) return false;

    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

    if (origin === undefined) return true;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
}

function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Payload too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
                reject(new Error('Invalid JSON payload'));
            }
        });
        req.on('error', reject);
    });
}
