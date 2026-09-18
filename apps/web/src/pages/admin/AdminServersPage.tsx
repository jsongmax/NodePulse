import React, { useEffect, useState } from 'react';
import {
  Plus,
  RotateCw,
  Trash2,
  Terminal,
  Server,
  X,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useI18n } from '../../i18n/index.js';
import { StatusDot } from '../../components/ui/StatusDot.js';
import { TokenReveal } from '../../components/ui/TokenReveal.js';
import { CodeBlock } from '../../components/ui/CodeBlock.js';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorState } from '../../components/ui/ErrorState.js';
import { formatRelativeTime } from '../../utils/format.js';

interface AdminServerItem {
  id: string;
  name: string;
  group_id?: string | null;
  token_prefix: string;
  note?: string | null;
  sort_order: number;
  public: boolean;
  geo_label?: string | null;
  country?: string | null;
  traffic_quota_bytes?: number | null;
  interval_s: number;
  created_at: number;
  updated_at: number;
}

export function AdminServersPage() {
  const { t } = useI18n();

  const [servers, setServers] = useState<AdminServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    server: { id: string; name: string };
    token: string;
    install_command: string;
  } | null>(null);

  const [rotateTarget, setRotateTarget] = useState<AdminServerItem | null>(
    null
  );
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AdminServerItem | null>(
    null
  );
  const [installTarget, setInstallTarget] = useState<AdminServerItem | null>(
    null
  );

  // Form states for adding server
  const [addName, setAddName] = useState('');
  const [addGeoLabel, setAddGeoLabel] = useState('');
  const [addInterval, setAddInterval] = useState(10);
  const [addPublic, setAddPublic] = useState(false);
  const [addNote, setAddNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadServers() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/servers');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setServers(json.data);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '获取服务器列表失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServers();
  }, []);

  // Handle server creation
  async function handleCreateServer(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
        body: JSON.stringify({
          name: addName.trim(),
          geo_label: addGeoLabel.trim() || undefined,
          interval_s: Number(addInterval) || 10,
          public: addPublic,
          note: addNote.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || '创建服务器失败');
      }

      setCreatedResult(json.data);
      setShowAddModal(false);
      // Reset form
      setAddName('');
      setAddGeoLabel('');
      setAddNote('');
      loadServers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  // Handle token rotation
  async function handleRotateToken() {
    if (!rotateTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/servers/${rotateTarget.id}/token/rotate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-NP-Request': '1',
          },
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || '重置令牌失败');
      }
      setRotatedToken(json.data.token);
      loadServers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '重置失败');
    } finally {
      setSubmitting(false);
    }
  }

  // Handle server delete
  async function handleDeleteServer() {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/servers/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: {
          'X-NP-Request': '1',
        },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || '删除服务器失败');
      }
      setDeleteTarget(null);
      loadServers();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-fg-1">
            {t('admin.serverList')}
          </h2>
          <p className="text-xs text-fg-3 mt-1">
            管理当前接入的监控节点与访问凭证
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg-0 font-medium text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{t('admin.addServer')}</span>
        </button>
      </div>

      {/* 2. Table or States */}
      {loading ? (
        <LoadingSkeleton count={4} />
      ) : errorMsg ? (
        <ErrorState title="加载失败" message={errorMsg} onRetry={loadServers} />
      ) : servers.length === 0 ? (
        <EmptyState
          title="暂无任何服务器"
          description="点击下方按钮添加您的第一个受控节点。"
          actionText={t('admin.addServer')}
          onAction={() => setShowAddModal(true)}
          icon={<Server className="w-7 h-7 text-accent" />}
        />
      ) : (
        <div className="rounded-xl bg-bg-1 border border-line-1 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-bg-2/60 border-b border-line-1 text-fg-3 font-medium uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">状态</th>
                  <th className="py-3 px-4">{t('admin.name')}</th>
                  <th className="py-3 px-4">{t('admin.region')}</th>
                  <th className="py-3 px-4">周期</th>
                  <th className="py-3 px-4">{t('admin.tokenPrefix')}</th>
                  <th className="py-3 px-4">更新于</th>
                  <th className="py-3 px-4 text-right">{t('admin.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-1">
                {servers.map((s) => (
                  <tr key={s.id} className="hover:bg-bg-3/30 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <StatusDot state="ok" size={8} />
                        <span className="font-mono text-fg-2 text-[11px]">
                          已就绪
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-medium text-fg-1">{s.name}</div>
                      {s.note && (
                        <div className="text-[10px] text-fg-3 truncate max-w-xs">
                          {s.note}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {s.geo_label ? (
                        <span className="px-2 py-0.5 rounded bg-bg-2 border border-line-1 text-[10px] font-medium text-fg-2">
                          {s.geo_label}
                        </span>
                      ) : (
                        <span className="text-fg-3">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-fg-2">
                      {s.interval_s}s
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-fg-3">
                      {s.token_prefix}...
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-fg-3 text-[11px]">
                      {formatRelativeTime(s.updated_at)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => setInstallTarget(s)}
                        className="p-1.5 rounded-lg hover:bg-bg-3 text-fg-2 hover:text-fg-1 transition-colors cursor-pointer"
                        title="查看安装命令"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRotateTarget(s);
                          setRotatedToken(null);
                        }}
                        className="p-1.5 rounded-lg hover:bg-bg-3 text-fg-2 hover:text-state-warn transition-colors cursor-pointer"
                        title={t('admin.rotateToken')}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(s)}
                        className="p-1.5 rounded-lg hover:bg-bg-3 text-fg-2 hover:text-state-crit transition-colors cursor-pointer"
                        title={t('admin.deleteServer')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. MODAL: Add Server */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-0/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-2xl bg-bg-1 border border-line-2 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-1 pb-3">
              <h3 className="text-base font-bold text-fg-1">
                {t('admin.addServer')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-fg-3 hover:text-fg-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateServer} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-fg-2 font-medium mb-1">
                  节点名称 <span className="text-state-crit">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="例如：tokyo-production-01"
                  className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-fg-1 text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-fg-2 font-medium mb-1">
                    地区标签
                  </label>
                  <input
                    type="text"
                    value={addGeoLabel}
                    onChange={(e) => setAddGeoLabel(e.target.value)}
                    placeholder="Tokyo, Japan"
                    className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-fg-1 text-xs focus:outline-none focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-fg-2 font-medium mb-1">
                    采样周期 (秒)
                  </label>
                  <select
                    value={addInterval}
                    onChange={(e) => setAddInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-fg-1 text-xs focus:outline-none focus:border-accent"
                  >
                    <option value={5}>5 秒 (高频)</option>
                    <option value={10}>10 秒 (推荐默认)</option>
                    <option value={20}>20 秒</option>
                    <option value={30}>30 秒</option>
                    <option value={60}>60 秒 (省额度)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-fg-2 font-medium mb-1">
                  备注说明
                </label>
                <input
                  type="text"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  placeholder="可选说明或机房标识"
                  className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-fg-1 text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="addPublic"
                  checked={addPublic}
                  onChange={(e) => setAddPublic(e.target.checked)}
                  className="rounded border-line-2 text-accent focus:ring-accent"
                />
                <label
                  htmlFor="addPublic"
                  className="text-fg-2 select-none cursor-pointer"
                >
                  公开模式下对未认证访客展示
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-line-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded-lg text-fg-2 hover:text-fg-1 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded-lg bg-accent text-bg-0 font-medium text-xs hover:brightness-110 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? '创建中...' : '立即创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: Server Created Success & One-time Token Reveal */}
      {createdResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-0/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-bg-1 border border-line-2 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-1 pb-3">
              <div className="flex items-center gap-2 text-state-ok">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-fg-1">
                  服务器已创建：{createdResult.server.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCreatedResult(null)}
                className="p-1 rounded-lg text-fg-3 hover:text-fg-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <TokenReveal token={createdResult.token} />

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-fg-2 block">
                在目标 Linux 服务器执行一键安装：
              </span>
              <CodeBlock code={createdResult.install_command} />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedResult(null)}
                className="px-4 py-2 rounded-xl bg-accent text-bg-0 font-medium text-xs hover:brightness-110 cursor-pointer"
              >
                我知道了，已完成安装配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: Rotate Token Confirmation */}
      {rotateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-0/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-2xl bg-bg-1 border border-line-2 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-1 pb-3">
              <h3 className="text-base font-bold text-fg-1">
                {t('admin.rotateConfirmTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setRotateTarget(null)}
                className="p-1 rounded-lg text-fg-3 hover:text-fg-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!rotatedToken ? (
              <>
                <p className="text-xs text-fg-2 leading-relaxed">
                  为 <strong className="text-fg-1">{rotateTarget.name}</strong>{' '}
                  {t('admin.rotateConfirmDesc')}
                </p>
                <div className="flex justify-end gap-2 pt-2 border-t border-line-1">
                  <button
                    type="button"
                    onClick={() => setRotateTarget(null)}
                    className="px-3 py-1.5 rounded-lg text-fg-2 hover:text-fg-1 text-xs cursor-pointer"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleRotateToken}
                    disabled={submitting}
                    className="px-3.5 py-1.5 rounded-lg bg-state-warn text-bg-0 font-medium text-xs hover:brightness-110 cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? '重置中...' : '确认重置'}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <TokenReveal token={rotatedToken} />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setRotateTarget(null)}
                    className="px-4 py-1.5 rounded-lg bg-accent text-bg-0 font-medium text-xs hover:brightness-110 cursor-pointer"
                  >
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. MODAL: Delete Server Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-0/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-2xl bg-bg-1 border border-line-2 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-1 pb-3">
              <h3 className="text-base font-bold text-state-crit">
                {t('admin.deleteConfirmTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 rounded-lg text-fg-3 hover:text-fg-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fg-2 leading-relaxed">
              确定要删除服务器{' '}
              <strong className="text-fg-1">{deleteTarget.name}</strong> 吗？
              {t('admin.deleteConfirmDesc')}
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-line-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded-lg text-fg-2 hover:text-fg-1 text-xs cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteServer}
                disabled={submitting}
                className="px-3.5 py-1.5 rounded-lg bg-state-crit text-bg-0 font-medium text-xs hover:brightness-110 cursor-pointer disabled:opacity-50"
              >
                {submitting ? '删除中...' : '确认永久删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL: View Install Command */}
      {installTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-0/75 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-bg-1 border border-line-2 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-1 pb-3">
              <h3 className="text-base font-bold text-fg-1">
                安装命令：{installTarget.name}
              </h3>
              <button
                type="button"
                onClick={() => setInstallTarget(null)}
                className="p-1 rounded-lg text-fg-3 hover:text-fg-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-fg-2">
                在目标机器上执行以下脚本。若需要新
                Token，请使用“重置令牌”按钮生成。
              </p>
              <CodeBlock
                code={`curl -fsSL ${window.location.origin}/install.sh -o /tmp/np-install.sh && sudo NP_HUB="${window.location.origin.replace(/^http/, 'ws')}/ws/agent" bash /tmp/np-install.sh`}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setInstallTarget(null)}
                className="px-4 py-1.5 rounded-lg bg-bg-3 text-fg-1 text-xs hover:bg-line-2 cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
