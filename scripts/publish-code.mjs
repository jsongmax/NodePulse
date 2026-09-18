#!/usr/bin/env node
/**
 * publish-code.mjs — 把本地 master 的"纯代码"历史发布到 GitHub。
 *
 * 本地仓库保留全部文档。发布时在临时克隆里用 git filter-branch 从每一个提交中剔除
 * EXCLUDE 列表（docs/、AGENTS.md、CLAUDE.md），只改文档的提交会被整体丢弃，
 * 然后把重写后的历史推送到远端分支。重写是确定性的：同样的本地历史每次得到同样的
 * 提交号，所以后续发布都是快进推送，不需要 --force。
 *
 * 用法：
 *   pnpm publish:code                 # 发布
 *   pnpm publish:code -- --dry-run    # 只重写并检查，不推送
 *   pnpm publish:code -- --force      # 本地历史被 rebase 过时才需要
 * 环境变量：
 *   PUBLISH_REMOTE   默认 https://github.com/jsongmax/NodePulse.git
 *   PUBLISH_BRANCH   默认 main
 *   SOURCE_BRANCH    默认 master
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REMOTE =
  process.env.PUBLISH_REMOTE ?? 'https://github.com/jsongmax/NodePulse.git';
const PUBLISH_BRANCH = process.env.PUBLISH_BRANCH ?? 'main';
const SOURCE_BRANCH = process.env.SOURCE_BRANCH ?? 'master';

/** 从发布历史中剔除的路径（相对仓库根） */
const EXCLUDE = ['docs', 'AGENTS.md', 'CLAUDE.md'];
/**
 * 发布树中不允许出现的字样（大小写不敏感），命中即中止。
 * 列表放在本地文件 docs/publish-forbidden.txt（一行一个，# 开头为注释）；docs/ 不会被发布，
 * 因此列表本身不会出现在公开仓库里。文件不存在时跳过该检查并给出警告。
 */
const FORBIDDEN_FILE = path.join(ROOT, 'docs', 'publish-forbidden.txt');
const FORBIDDEN_PATTERNS = existsSync(FORBIDDEN_FILE)
  ? readFileSync(FORBIDDEN_FILE, 'utf8')
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'))
  : [];

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

const git = (cwd, argv, opts = {}) =>
  (
    execFileSync('git', argv, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: '1' },
      ...opts,
    }) ?? ''
  ) // stdio: 'inherit' 时返回 null
    .trim();

async function main() {
  git(ROOT, ['rev-parse', '--is-inside-work-tree']);
  const srcHead = git(ROOT, ['rev-parse', '--short', SOURCE_BRANCH]);
  console.log(
    `源分支 ${SOURCE_BRANCH}@${srcHead} → ${REMOTE} (${PUBLISH_BRANCH})`
  );

  const tmp = await mkdtemp(path.join(tmpdir(), 'np-publish-'));
  try {
    git(ROOT, [
      'clone',
      '--quiet',
      '--branch',
      SOURCE_BRANCH,
      '--single-branch',
      '--no-hardlinks',
      ROOT,
      tmp,
    ]);

    // 逐提交剔除排除路径；只改文档的提交整体丢弃
    const rmCmd = `git rm -r --cached --ignore-unmatch -q ${EXCLUDE.map((p) => `'${p}'`).join(' ')}`;
    git(tmp, [
      'filter-branch',
      '-f',
      '--index-filter',
      rmCmd,
      '--prune-empty',
      '--',
      '--all',
    ]);

    // 校验 1：排除路径不在最终树里
    const tree = git(tmp, ['ls-tree', '-r', '--name-only', 'HEAD']).split('\n');
    const leaked = tree.filter((f) =>
      EXCLUDE.some((p) => f === p || f.startsWith(p + '/'))
    );
    if (leaked.length)
      throw new Error(`排除路径仍在发布树中：\n${leaked.join('\n')}`);

    // filter-branch 会在 refs/original/ 保留未重写的备份引用，必须删掉，否则会被一起推送/检查到
    const backups = git(tmp, [
      'for-each-ref',
      '--format=%(refname)',
      'refs/original/',
    ]);
    for (const ref of backups.split('\n').filter(Boolean))
      git(tmp, ['update-ref', '-d', ref]);

    // 校验 2：发布分支的任何历史提交都不含排除路径
    const histLeak = git(tmp, [
      'log',
      SOURCE_BRANCH,
      '--name-only',
      '--pretty=format:',
      '--',
      ...EXCLUDE,
    ]).trim();
    if (histLeak) throw new Error(`历史中仍有排除路径：\n${histLeak}`);

    // 校验 3：发布树中没有禁用字样
    if (!FORBIDDEN_PATTERNS.length) {
      console.warn('警告：未找到 docs/publish-forbidden.txt，跳过禁用字样检查');
    } else {
      let hits = '';
      try {
        hits = git(tmp, [
          'grep',
          '-i',
          '-l',
          ...FORBIDDEN_PATTERNS.flatMap((p) => ['-e', p]),
          'HEAD',
        ]);
      } catch {
        /* grep 无匹配时退出码 1，视为通过 */
      }
      if (hits) throw new Error(`发布树中含有禁用字样：\n${hits}`);
    }

    const count = git(tmp, ['rev-list', '--count', 'HEAD']);
    const pubHead = git(tmp, ['rev-parse', '--short', 'HEAD']);
    console.log(
      `重写完成：${count} 个提交，发布头 ${pubHead}，文件 ${tree.length} 个`
    );
    console.log(tree.map((f) => '  ' + f).join('\n'));

    if (DRY_RUN) {
      console.log('\n--dry-run：未推送。');
      return;
    }
    const pushArgs = [
      'push',
      ...(FORCE ? ['--force'] : []),
      REMOTE,
      `${SOURCE_BRANCH}:${PUBLISH_BRANCH}`,
    ];
    console.log(`\n推送：git ${pushArgs.join(' ')}`);
    git(tmp, pushArgs, { stdio: 'inherit' });
    console.log('完成。');
  } finally {
    await rm(tmp, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    }).catch(() => {});
  }
}

main().catch((e) => {
  console.error('\n发布中止：' + (e.stderr?.toString().trim() || e.message));
  process.exit(1);
});
