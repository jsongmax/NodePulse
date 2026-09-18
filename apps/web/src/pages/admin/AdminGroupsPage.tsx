import React, { useEffect, useState } from 'react';
import { Plus, Trash2, FolderTree, X } from 'lucide-react';
import { useI18n } from '../../i18n/index.js';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton.js';
import { EmptyState } from '../../components/ui/EmptyState.js';

interface GroupItem {
  id: string;
  name: string;
  sort_order: number;
}

export function AdminGroupsPage() {
  const { t } = useI18n();

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [sortInput, setSortInput] = useState(0);

  async function loadGroups() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/groups');
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setGroups(json.data);
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function handleAddGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;

    try {
      const res = await fetch('/api/admin/groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
        body: JSON.stringify({
          name: nameInput.trim(),
          sort_order: Number(sortInput) || 0,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setNameInput('');
        setShowAdd(false);
        loadGroups();
      }
    } catch {
      alert('添加分组失败');
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!confirm('确认删除该分组？所属服务器的分组关联将被清除。')) return;
    try {
      await fetch(`/api/admin/groups/${id}`, {
        method: 'DELETE',
        headers: {
          'X-NP-Request': '1',
        },
      });
      loadGroups();
    } catch {
      alert('删除失败');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-fg-1">
            {t('nav.groups')}
          </h2>
          <p className="text-xs text-fg-3 mt-1">
            创建和维护服务器的逻辑分类标签
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-bg-0 font-medium text-xs hover:brightness-110 cursor-pointer shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>新建分组</span>
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton count={3} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="暂无任何分组"
          description="添加分组可以更好地组织管理不同机房或业务线的节点。"
          actionText="新建分组"
          onAction={() => setShowAdd(true)}
          icon={<FolderTree className="w-7 h-7 text-accent" />}
        />
      ) : (
        <div className="rounded-xl bg-bg-1 border border-line-1 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-bg-2/60 border-b border-line-1 text-fg-3 text-[11px] uppercase">
              <tr>
                <th className="py-3 px-4">分组名称</th>
                <th className="py-3 px-4">排序权重</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-1">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-bg-3/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-fg-1">{g.name}</td>
                  <td className="py-3 px-4 font-mono text-fg-3">
                    {g.sort_order}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(g.id)}
                      className="p-1.5 rounded-lg text-fg-3 hover:text-state-crit transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-0/75 backdrop-blur-sm">
          <div className="w-full max-w-sm p-6 rounded-2xl bg-bg-1 border border-line-2 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-1 pb-3">
              <h3 className="text-sm font-bold text-fg-1">新建分组</h3>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="p-1 text-fg-3 hover:text-fg-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddGroup} className="space-y-3 text-xs">
              <div>
                <label className="block text-fg-2 font-medium mb-1">
                  分组名称 <span className="text-state-crit">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="例如：亚太节点"
                  className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-fg-1 text-xs focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-fg-2 font-medium mb-1">
                  排序权重
                </label>
                <input
                  type="number"
                  value={sortInput}
                  onChange={(e) => setSortInput(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-2 border border-line-1 text-fg-1 text-xs focus:outline-none focus:border-accent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-line-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-3 py-1.5 rounded-lg text-fg-2 hover:text-fg-1 cursor-pointer"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-accent text-bg-0 font-medium cursor-pointer"
                >
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
