import path from 'node:path';

/** files that ship with the API (fonts, tools), resolved from the API folder: the working directory in dev,
    tests and the Docker image (WORKDIR), or API_ROOT if set. Works the same from src/ and the dist bundle. */
export const fromApiRoot = (...parts: string[]) => path.join(process.env.API_ROOT ?? process.cwd(), ...parts);
