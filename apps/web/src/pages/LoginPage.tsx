import React, { useState } from 'react';
import { useNavigate, Link } from '@tanstack/react-router';
import { startAuthentication } from '@simplewebauthn/browser';
import { Shield, Key, AlertCircle, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/index.js';

export function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handlePasskeyLogin() {
    setLoading(true);
    setErrorMsg(null);

    try {
      // 1. Fetch authentication options
      const optRes = await fetch('/api/auth/passkey/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
      });

      if (!optRes.ok) {
        throw new Error('Failed to initiate passkey authentication options');
      }

      const optJson = (await optRes.json()) as { ok: boolean; data: any };
      if (!optJson.ok || !optJson.data) {
        throw new Error('Invalid options from server');
      }

      // 2. Trigger browser WebAuthn prompt
      const assertion = await startAuthentication({
        optionsJSON: optJson.data,
      });

      // 3. Verify assertion on server
      const verifyRes = await fetch('/api/auth/passkey/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
        body: JSON.stringify(assertion),
      });

      const verifyJson = (await verifyRes.json()) as {
        ok: boolean;
        error?: { message: string };
      };

      if (!verifyRes.ok || !verifyJson.ok) {
        throw new Error(verifyJson.error?.message || t('auth.loginFailed'));
      }

      // 4. Redirect to overview
      navigate({ to: '/' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('auth.loginFailed');
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] p-6 sm:p-8 rounded-2xl bg-bg-1 border border-line-1 surface-glass text-center space-y-6 select-none">
        {/* Brand Icon */}
        <div className="relative flex items-center justify-center w-14 h-14 mx-auto">
          <div className="absolute w-14 h-14 rounded-full border border-accent opacity-20 animate-ping" />
          <div className="w-10 h-10 rounded-2xl bg-accent-soft border border-accent/30 flex items-center justify-center text-accent">
            <Shield className="w-5 h-5" />
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg-1">
            {t('auth.title')}
          </h1>
          <p className="text-xs text-fg-3 mt-1.5 leading-relaxed">
            {t('auth.noPasswordNotice')}
          </p>
        </div>

        {/* Error alert */}
        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-state-crit/15 border border-state-crit/25 text-state-crit text-xs flex items-start gap-2 text-left animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* Login Action */}
        <button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl bg-accent text-bg-0 font-medium text-sm hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t('auth.authenticating')}</span>
            </>
          ) : (
            <>
              <Key className="w-4 h-4" />
              <span>{t('auth.loginButton')}</span>
            </>
          )}
        </button>

        {/* Footer info */}
        <div className="pt-2 border-t border-line-1 flex items-center justify-between text-xs text-fg-3">
          <span>未初始化站点？</span>
          <Link
            to="/setup"
            className="text-accent hover:underline transition-colors"
          >
            进入安装向导
          </Link>
        </div>
      </div>
    </div>
  );
}
