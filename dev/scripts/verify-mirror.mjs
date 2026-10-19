#!/usr/bin/env node
// Run from the trusted destination base. Candidate files are Git data only.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SYNC_CONTRACT, desiredTree, diffTrees, snapshotProvenance, releaseBranch } from "./legacy-projection.mjs";
import { assertReleaseVersion } from "./sync-version.mjs";
const assertSha = (sha) => { if (!/^[0-9a-f]{40}$/.test(sha ?? "")) throw new Error("expected an immutable Git SHA"); return sha; };
export const sourceProvenance = (message) => snapshotProvenance(message).sha;

export const verifyProjection = ({ sourceFiles, candidateFiles, baseFiles }) => {
  for (const path of Object.values(SYNC_CONTRACT.replacements)) {
    if (!sourceFiles.has(path)) throw new Error(`canonical source is not ready for mirror integrity: missing ${path}`);
  }
  const expected = desiredTree({ sourceFiles, destFiles: baseFiles });
  const diff = diffTrees(candidateFiles, expected);
  if (!diff.noop) throw new Error(`Mirror differs from trusted canonical projection: ${JSON.stringify(diff)}`);
  return { files: expected.size, differences: 0 };
};

export const createGithubReader = ({ token, fetch = globalThis.fetch }) => {
  const api = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, { headers: {
      accept: "application/vnd.github+json", ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-github-api-version": "2022-11-28",
    } });
    if (!response.ok) throw new Error(`GitHub read failed (${response.status})`);
    return response.json();
  };
  return {
    async main(repo = SYNC_CONTRACT.sourceRepo) {
      return assertSha((await api(`/repos/${repo}/git/ref/heads/main`)).object.sha);
    },
    async release(tag) {
      releaseBranch(tag);
      const release = await api(`/repos/${SYNC_CONTRACT.sourceRepo}/releases/tags/${encodeURIComponent(tag)}`);
      if (release.tag_name !== tag || release.draft || release.prerelease || !release.published_at) throw new Error("source must be a published stable release");
      let object = (await api(`/repos/${SYNC_CONTRACT.sourceRepo}/git/ref/tags/${encodeURIComponent(tag)}`)).object;
      for (let i = 0; object.type === "tag" && i < 8; i++) object = (await api(`/repos/${SYNC_CONTRACT.sourceRepo}/git/tags/${assertSha(object.sha)}`)).object;
      if (object.type !== "commit") throw new Error("release tag does not resolve to a commit");
      return { sha: assertSha(object.sha), tag };
    },
    async isAncestor(repo, ancestor, descendant) {
      const comparison = await api(`/repos/${repo}/compare/${assertSha(ancestor)}...${assertSha(descendant)}?per_page=1`);
      if (["ahead", "identical"].includes(comparison.status)) return true;
      if (["behind", "diverged"].includes(comparison.status)) return false;
      throw new Error(`cannot establish ancestry: compare status ${comparison.status}`);
    },
    async commit(repo, sha) { return api(`/repos/${repo}/git/commits/${assertSha(sha)}`); },
    async version(repo, sha) {
      const file = await api(`/repos/${repo}/contents/plugin.json?ref=${assertSha(sha)}`);
      if (file.encoding !== "base64") throw new Error("cannot read release version");
      return JSON.parse(Buffer.from(file.content, "base64").toString("utf8")).version;
    },
    async tree(repo, sha) {
      const commit = await this.commit(repo, sha);
      const tree = await api(`/repos/${repo}/git/trees/${assertSha(commit.tree.sha)}?recursive=1`);
      if (tree.truncated) throw new Error("GitHub tree is truncated");
      return new Map(tree.tree.filter((item) => item.type !== "tree").map((item) => {
        if (item.type !== "blob" || !["100644", "100755"].includes(item.mode)) throw new Error(`unsupported mirror entry ${item.path}`);
        return [item.path, { mode: item.mode, blobSha: item.sha }];
      }));
    },
  };
};

export const verifyGithubMirror = async ({ event, repository, reader }) => {
  const pr = event.pull_request;
  if (repository !== SYNC_CONTRACT.destRepo || pr?.base?.repo?.full_name !== SYNC_CONTRACT.destRepo || pr.base.ref !== SYNC_CONTRACT.destBaseBranch || pr.head?.repo?.full_name !== SYNC_CONTRACT.destRepo) throw new Error("integrity check only accepts release PRs inside the fixed legacy repository main");
  const head = assertSha(pr.head.sha);
  const commit = await reader.commit(SYNC_CONTRACT.destRepo, head);
  const pin = snapshotProvenance(commit.message);
  if (pr.head.ref !== releaseBranch(pin.tag) || commit.parents?.length !== 1) throw new Error("not a single owned release snapshot commit");
  const release = await reader.release(pin.tag);
  if (release.sha !== pin.sha) throw new Error("source SHA does not match the published release tag");
  if (!await reader.isAncestor(SYNC_CONTRACT.sourceRepo, pin.sha, await reader.main())) throw new Error("release commit is not on canonical main");
  const base = await reader.main(SYNC_CONTRACT.destRepo);
  // Requiring current main as parent makes the reviewed tree the merge tree.
  // A base advance requires a new reviewed snapshot, not an automatic rewrite.
  if (commit.parents[0].sha !== base) throw new Error("destination main changed since this snapshot; review a fresh snapshot manually");
  const [sourceFiles, candidateFiles, baseFiles, sourceVersion, destinationVersion] = await Promise.all([
    reader.tree(SYNC_CONTRACT.sourceRepo, pin.sha), reader.tree(SYNC_CONTRACT.destRepo, head), reader.tree(SYNC_CONTRACT.destRepo, base),
    reader.version(SYNC_CONTRACT.sourceRepo, pin.sha), reader.version(SYNC_CONTRACT.destRepo, base),
  ]);
  const result = verifyProjection({ sourceFiles, candidateFiles, baseFiles });
  assertReleaseVersion({ sourceVersion, destinationVersion, tag: pin.tag, sameTree: diffTrees(baseFiles, candidateFiles).noop });
  if ((await reader.release(pin.tag)).sha !== pin.sha) throw new Error("release tag changed during verification");
  if (await reader.main(SYNC_CONTRACT.destRepo) !== base) throw new Error("destination main advanced during verification; rerun");
  return { ...result, sourceSha: pin.sha, tag: pin.tag, head, base };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    if (!process.argv.includes("--github") || process.env.GITHUB_EVENT_NAME !== "pull_request_target") throw new Error("run --github from the trusted base workflow");
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    console.log(JSON.stringify(await verifyGithubMirror({ event, repository: process.env.GITHUB_REPOSITORY, reader: createGithubReader({ token: process.env.GH_TOKEN }) }), null, 2));
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
