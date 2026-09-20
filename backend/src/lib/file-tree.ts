import { promises as fs } from "node:fs";
import path from "node:path";
import { repositoryDir } from "./storage.js";

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  modifiedAt?: string;
  children?: TreeNode[];
}

async function readNode(absoluteDir: string, relativeDir: string): Promise<TreeNode[]> {
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

  const nodes = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry): Promise<TreeNode> => {
        const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
        const absolutePath = path.join(absoluteDir, entry.name);

        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: relativePath,
            type: "folder",
            children: await readNode(absolutePath, relativePath),
          };
        }

        const stat = await fs.stat(absolutePath);
        return {
          name: entry.name,
          path: relativePath,
          type: "file",
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        };
      })
  );

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, "de");
  });
}

export async function buildRepositoryTree(repositoryId: string): Promise<TreeNode[]> {
  const dir = repositoryDir(repositoryId);
  try {
    return await readNode(dir, "");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Same as buildRepositoryTree, but rooted at an already-resolved subfolder. */
export async function buildTreeAt(
  absoluteDir: string,
  relativeDir: string
): Promise<TreeNode[]> {
  try {
    return await readNode(absoluteDir, relativeDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function flattenFiles(nodes: TreeNode[]): TreeNode[] {
  const files: TreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") files.push(node);
    else if (node.children) files.push(...flattenFiles(node.children));
  }
  return files;
}
