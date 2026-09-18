import React, { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { startRegistration } from '@simplewebauthn/browser';
import {
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { useI18n } from '../i18n/index.js';
import { ErrorState } from '../components/ui/ErrorState.js';

export function SetupPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [setupDone, setSetupDone] = useState<boolean | null>(null);

  // Check setup status on load
  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((data: any) => {
        if (data?.data?.setup_done) {
          setSetupDone(true);
        } else {
          setSetupDone(false);
        }
      })
      .catch(() => setSetupDone(false));
  }, []);

  if (setupDone === true) {
    return (
      <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
        <ErrorState
          title="系统已初始化"
          message="NodePulse 已完成首次配置并绑定管理员通行密钥。SETUP_TOKEN 已永久失效。"
          onRetry={() => navigate({ to: '/login' })}
        />
      </div>
    );
  }

  // Step 1: Verify SETUP_TOKEN
  async function handleVerifyToken(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/setup/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });

      const json = (await res.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!res.ok || !json.ok) {
        throw new Error(
          json.error?.message || '初始化令牌验证失败，请核对后重试'
        );
      }

      setStep(2);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '验证失败');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Register Passkey
  async function handleRegisterPasskey() {
    setLoading(true);
    setErrorMsg(null);

    try {
      const optRes = await fetch('/api/setup/passkey/options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
      });

      const optJson = (await optRes.json()) as {
        ok: boolean;
        data: any;
        error?: { message: string };
      };
      if (!optRes.ok || !optJson.ok) {
        throw new Error(optJson.error?.message || '获取注册凭据选项失败');
      }

      const attestation = await startRegistration({
        optionsJSON: optJson.data,
      });

      const verifyRes = await fetch('/api/setup/passkey/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
        body: JSON.stringify(attestation),
      });

      const verifyJson = (await verifyRes.json()) as {
        ok: boolean;
        error?: { message: string };
      };
      if (!verifyRes.ok || !verifyJson.ok) {
        throw new Error(verifyJson.error?.message || 'Passkey 注册验证失败');
      }

      setStep(3);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-[480px] p-6 sm:p-8 rounded-2xl bg-bg-1 border border-line-1 surface-glass select-none space-y-6">
        {/* Progress indicators */}
        <div className="flex items-center justify-between px-4 pb-2 border-b border-line-1 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-medium ${
                step >= 1 ? 'bg-accent text-bg-0' : 'bg-bg-3 text-fg-3'
              }`}
            >
              1
            </span>
            <span
              className={step === 1 ? 'font-semibold text-fg-1' : 'text-fg-3'}
            >
              验证令牌
            </span>
          </div>

          <div className="h-0.5 w-8 bg-line-2" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-medium ${
                step >= 2 ? 'bg-accent text-bg-0' : 'bg-bg-3 text-fg-3'
              }`}
            >
              2
            </span>
            <span
              className={step === 2 ? 'font-semibold text-fg-1' : 'text-fg-3'}
            >
              绑定密钥
            </span>
          </div>

          <div className="h-0.5 w-8 bg-line-2" />

          <div className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center font-mono font-medium ${
                step === 3 ? 'bg-state-ok text-bg-0' : 'bg-bg-3 text-fg-3'
              }`}
            >
              3
            </span>
            <span
              className={step === 3 ? 'font-semibold text-fg-1' : 'text-fg-3'}
            >
              完成
            </span>
          </div>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-state-crit/15 border border-state-crit/25 text-state-crit text-xs flex items-start gap-2 text-left animate-fadeIn"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-snug">{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: Verify token */}
        {step === 1 && (
          <form onSubmit={handleVerifyToken} className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mx-auto mb-2">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg-1">
                {t('setup.step1Title')}
              </h2>
              <p className="text-xs text-fg-3 mt-1 leading-relaxed">
                {t('setup.step1Desc')}
              </p>
            </div>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder={t('setup.tokenPlaceholder')}
              className="w-full px-4 py-3 rounded-xl bg-bg-2 border border-line-2 text-fg-1 placeholder-fg-3 text-xs font-mono focus:outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="w-full py-3 px-4 rounded-xl bg-accent text-bg-0 font-medium text-sm hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{t('setup.verifyToken')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: Create passkey */}
        {step === 2 && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mx-auto mb-2">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg-1">
                {t('setup.step2Title')}
              </h2>
              <p className="text-xs text-fg-3 mt-1 leading-relaxed">
                {t('setup.step2Desc')}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRegisterPasskey}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-accent text-bg-0 font-medium text-sm hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('setup.registering')}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{t('setup.registerPasskey')}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* STEP 3: Setup complete */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-state-ok/20 text-state-ok flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-fg-1">
                {t('setup.step3Title')}
              </h2>
              <p className="text-xs text-fg-3 mt-1 leading-relaxed">
                {t('setup.step3Desc')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: '/' })}
              className="w-full py-3 px-4 rounded-xl bg-state-ok text-bg-0 font-medium text-sm hover:brightness-110 active:scale-95 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t('setup.goToDashboard')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
