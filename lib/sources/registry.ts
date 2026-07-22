import type { SourceAdapter, SourceKind } from "./types";
import { greenhouse } from "./adapters/greenhouse";
import { lever } from "./adapters/lever";
import { ashby } from "./adapters/ashby";
import { githubRepo } from "./adapters/githubRepo";
import { rss } from "./adapters/rss";
import { json } from "./adapters/json";

export const adapters: Record<SourceKind, SourceAdapter> = {
  greenhouse,
  lever,
  ashby,
  "github-repo": githubRepo,
  rss,
  json,
};

export function getAdapter(kind: string): SourceAdapter | undefined {
  return adapters[kind as SourceKind];
}

export const SUPPORTED_KINDS = Object.keys(adapters) as SourceKind[];
