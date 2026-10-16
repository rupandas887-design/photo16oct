import React, { useState, useEffect } from 'react';
import { useRole, mapToDbUserId } from './RoleContext';
import { Shield, Key, Lock, CheckCircle2, User, Eye, EyeOff } from 'lucide-react';

export const OwnerPasswordResetModule: React.FC = () => {
  const { users, resetUserPassword, currentUser } = useRole();

  // Filter strictly for dashboard-level login accounts only (NO STAFF)
  const businessOwnerAccount =
    (currentUser?.role === 'Business Owner'
      ? (users.find(u => u.id === currentUser.id || u.email?.toLowerCase() === currentUser.email?.toLowerCase()) || currentUser)
      : null) ||
    users.find(u => u.role === 'Business Owner') ||
    users[0];
  const operationsDashboardAccount =
    users.find(u => u.email?.toLowerCase() === 'operation@photocrew.com') ||
    users.find(u => u.id === '00000000-0000-0000-0000-000000000003') ||
    users.find(u => u.role === 'Operations Team');
  const productionDashboardAccount =
    users.find(u => u.email?.toLowerCase() === 'production@photocrew.com') ||
    users.find(u => u.id === '00000000-0000-0000-0000-000000000004') ||
    users.find(u => u.role === 'Production Team');

  // Business Owner reset state
  const [ownerPassword, setOwnerPassword] = useState<string>(() => businessOwnerAccount?.password || '');
  const [showOwnerPassword, setShowOwnerPassword] = useState<boolean>(false);
  const [hasUserEdited, setHasUserEdited] = useState<boolean>(false);
  const [confirmOwnerReset, setConfirmOwnerReset] = useState<boolean>(false);
  const [ownerLoading, setOwnerLoading] = useState<boolean>(false);
  const [ownerSuccess, setOwnerSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (businessOwnerAccount?.password && !hasUserEdited) {
      setOwnerPassword(businessOwnerAccount.password);
    }
    const fetchFreshPassword = async () => {
      if (!businessOwnerAccount?.id) return;
      try {
        const dbTargetId = mapToDbUserId(businessOwnerAccount.id);
        const res = await fetch('/api/db/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            table: 'users',
            matchColumn: 'id',
            matchValue: dbTargetId
          })
        });
        const resData = await res.json();
        if (isMounted && !hasUserEdited && resData.success && resData.data?.[0]?.password) {
          setOwnerPassword(resData.data[0].password);
        }
      } catch (err) {
        console.warn("Failed to fetch fresh owner password:", err);
      }
    };
    fetchFreshPassword();
    return () => {
      isMounted = false;
    };
  }, [businessOwnerAccount?.id, businessOwnerAccount?.password, hasUserEdited]);

  // Operations Dashboard reset state
  const [opsPassword, setOpsPassword] = useState<string>(() => operationsDashboardAccount?.password || '');
  const [showOpsPassword, setShowOpsPassword] = useState<boolean>(false);
  const [hasOpsUserEdited, setHasOpsUserEdited] = useState<boolean>(false);
  const [confirmOpsReset, setConfirmOpsReset] = useState<boolean>(false);
  const [opsLoading, setOpsLoading] = useState<boolean>(false);
  const [opsSuccess, setOpsSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (operationsDashboardAccount?.password && !hasOpsUserEdited) {
      setOpsPassword(operationsDashboardAccount.password);
    }
    const fetchFreshOpsPassword = async () => {
      if (!operationsDashboardAccount?.id && !operationsDashboardAccount?.email) return;
      try {
        let fetchedPwd = '';
        if (operationsDashboardAccount?.id) {
          const dbTargetId = mapToDbUserId(operationsDashboardAccount.id);
          const res = await fetch('/api/db/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'users',
              matchColumn: 'id',
              matchValue: dbTargetId
            })
          });
          const resData = await res.json();
          if (resData.success && resData.data?.[0]?.password) {
            fetchedPwd = resData.data[0].password;
          }
        }
        if (!fetchedPwd && operationsDashboardAccount?.email) {
          const res = await fetch('/api/db/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'users',
              matchColumn: 'email',
              matchValue: operationsDashboardAccount.email
            })
          });
          const resData = await res.json();
          if (resData.success && resData.data?.[0]?.password) {
            fetchedPwd = resData.data[0].password;
          }
        }
        if (isMounted && !hasOpsUserEdited && fetchedPwd) {
          setOpsPassword(fetchedPwd);
        }
      } catch (err) {
        console.warn("Failed to fetch fresh operations password:", err);
      }
    };
    fetchFreshOpsPassword();
    return () => {
      isMounted = false;
    };
  }, [operationsDashboardAccount?.id, operationsDashboardAccount?.password, operationsDashboardAccount?.email, hasOpsUserEdited]);

  // Production Dashboard reset state
  const [prodPassword, setProdPassword] = useState<string>(() => productionDashboardAccount?.password || '');
  const [showProdPassword, setShowProdPassword] = useState<boolean>(false);
  const [hasProdUserEdited, setHasProdUserEdited] = useState<boolean>(false);
  const [confirmProdReset, setConfirmProdReset] = useState<boolean>(false);
  const [prodLoading, setProdLoading] = useState<boolean>(false);
  const [prodSuccess, setProdSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (productionDashboardAccount?.password && !hasProdUserEdited) {
      setProdPassword(productionDashboardAccount.password);
    }
    const fetchFreshProdPassword = async () => {
      if (!productionDashboardAccount?.id && !productionDashboardAccount?.email) return;
      try {
        let fetchedPwd = '';
        if (productionDashboardAccount?.id) {
          const dbTargetId = mapToDbUserId(productionDashboardAccount.id);
          const res = await fetch('/api/db/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'users',
              matchColumn: 'id',
              matchValue: dbTargetId
            })
          });
          const resData = await res.json();
          if (resData.success && resData.data?.[0]?.password) {
            fetchedPwd = resData.data[0].password;
          }
        }
        if (!fetchedPwd && productionDashboardAccount?.email) {
          const res = await fetch('/api/db/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              table: 'users',
              matchColumn: 'email',
              matchValue: productionDashboardAccount.email
            })
          });
          const resData = await res.json();
          if (resData.success && resData.data?.[0]?.password) {
            fetchedPwd = resData.data[0].password;
          }
        }
        if (isMounted && !hasProdUserEdited && fetchedPwd) {
          setProdPassword(fetchedPwd);
        }
      } catch (err) {
        console.warn("Failed to fetch fresh production password:", err);
      }
    };
    fetchFreshProdPassword();
    return () => {
      isMounted = false;
    };
  }, [productionDashboardAccount?.id, productionDashboardAccount?.password, productionDashboardAccount?.email, hasProdUserEdited]);

  const handleOwnerReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessOwnerAccount) {
      alert('Business Owner account not found.');
      return;
    }
    if (!ownerPassword || ownerPassword.trim().length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }
    if (!confirmOwnerReset) {
      alert('Please confirm the password reset by checking the confirmation box.');
      return;
    }

    try {
      setOwnerLoading(true);
      setOwnerSuccess(null);
      const newPasswordValue = ownerPassword.trim();
      await resetUserPassword(businessOwnerAccount.id, newPasswordValue);
      setOwnerSuccess(`Password for Business Owner Dashboard (${businessOwnerAccount.name}) successfully reset!`);
      setOwnerPassword(newPasswordValue);
      setHasUserEdited(false);
      setConfirmOwnerReset(false);
    } catch (err: any) {
      alert(`Failed to reset password: ${err.message || err}`);
    } finally {
      setOwnerLoading(false);
    }
  };

  const handleOpsReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operationsDashboardAccount) {
      alert('Operations Dashboard account not found.');
      return;
    }
    if (!opsPassword || opsPassword.trim().length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }
    if (!confirmOpsReset) {
      alert('Please confirm the password reset by checking the confirmation box.');
      return;
    }

    try {
      setOpsLoading(true);
      setOpsSuccess(null);
      const newPasswordValue = opsPassword.trim();
      await resetUserPassword(operationsDashboardAccount.id, newPasswordValue);
      setOpsSuccess(`Password for Operations Dashboard (${operationsDashboardAccount.name}) successfully reset!`);
      setOpsPassword(newPasswordValue);
      setHasOpsUserEdited(false);
      setConfirmOpsReset(false);
    } catch (err: any) {
      alert(`Failed to reset password: ${err.message || err}`);
    } finally {
      setOpsLoading(false);
    }
  };

  const handleProdReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productionDashboardAccount) {
      alert('Production Dashboard account not found.');
      return;
    }
    if (!prodPassword || prodPassword.trim().length < 6) {
      alert('Password must be at least 6 characters.');
      return;
    }
    if (!confirmProdReset) {
      alert('Please confirm the password reset by checking the confirmation box.');
      return;
    }

    try {
      setProdLoading(true);
      setProdSuccess(null);
      const newPasswordValue = prodPassword.trim();
      await resetUserPassword(productionDashboardAccount.id, newPasswordValue);
      setProdSuccess(`Password for Production Dashboard (${productionDashboardAccount.name}) successfully reset!`);
      setProdPassword(newPasswordValue);
      setHasProdUserEdited(false);
      setConfirmProdReset(false);
    } catch (err: any) {
      alert(`Failed to reset password: ${err.message || err}`);
    } finally {
      setProdLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/[0.03] blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3.5 mb-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide font-sans">
              Password Reset
            </h1>
            <p className="text-xs text-zinc-400 font-mono mt-0.5">
              Secure dashboard-level credential management for Business Owner, Operations, and Production login accounts.
            </p>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. BUSINESS OWNER */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">
                    Business Owner
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono">Dashboard Account</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 text-[10px] font-mono font-bold border border-amber-500/20">
                Primary Admin
              </span>
            </div>

            {ownerSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{ownerSuccess}</span>
              </div>
            )}

            <form onSubmit={handleOwnerReset} className="space-y-4 pt-2">
              {businessOwnerAccount && (
                <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs space-y-1">
                  <div className="text-[10px] text-zinc-400 uppercase font-mono">Target Account:</div>
                  <div className="font-bold text-white">{businessOwnerAccount.name}</div>
                  <div className="text-zinc-400 font-mono text-[11px]">{businessOwnerAccount.email}</div>
                  <div className="text-amber-400 font-mono text-[10px]">Role: Business Owner</div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="owner_current_password" className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 font-bold block">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="owner_current_password"
                    name="current_password"
                    aria-label="Current Password"
                    type={showOwnerPassword ? "text" : "password"}
                    value={ownerPassword}
                    onChange={(e) => {
                      setHasUserEdited(true);
                      setOwnerPassword(e.target.value);
                    }}
                    placeholder="Current Password"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-3.5 pr-10 text-zinc-100 font-mono text-xs focus:outline-none focus:border-amber-500"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOwnerPassword(!showOwnerPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                    title={showOwnerPassword ? "Hide password" : "Show password"}
                  >
                    {showOwnerPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 bg-zinc-950/50 rounded-xl border border-zinc-800">
                <input
                  type="checkbox"
                  id="confirm_owner_reset"
                  checked={confirmOwnerReset}
                  onChange={(e) => setConfirmOwnerReset(e.target.checked)}
                  className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  required
                />
                <label htmlFor="confirm_owner_reset" className="text-[11px] text-zinc-300 cursor-pointer select-none leading-relaxed">
                  I confirm reset of Business Owner Dashboard password.
                </label>
              </div>

              <button
                type="submit"
                disabled={ownerLoading || !confirmOwnerReset}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs uppercase tracking-wider font-mono rounded-xl transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{ownerLoading ? 'Resetting...' : 'Reset Business Owner Password'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* 2. OPERATIONS DASHBOARD */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">
                    Operations Manager
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono">Dashboard Account</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 text-[10px] font-mono font-bold border border-sky-500/20">
                Operations Login
              </span>
            </div>

            {opsSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{opsSuccess}</span>
              </div>
            )}

            <form onSubmit={handleOpsReset} className="space-y-4 pt-2">
              {operationsDashboardAccount && (
                <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs space-y-1">
                  <div className="text-[10px] text-zinc-400 uppercase font-mono">Target Account:</div>
                  <div className="font-bold text-white">{operationsDashboardAccount.name}</div>
                  <div className="text-zinc-400 font-mono text-[11px]">{operationsDashboardAccount.email}</div>
                  <div className="text-sky-400 font-mono text-[10px]">Role: {operationsDashboardAccount.role}</div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="ops_current_password" className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 font-bold block">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="ops_current_password"
                    name="current_password"
                    aria-label="Current Password"
                    type={showOpsPassword ? "text" : "password"}
                    value={opsPassword}
                    onChange={(e) => {
                      setHasOpsUserEdited(true);
                      setOpsPassword(e.target.value);
                    }}
                    placeholder="Current Password"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-3.5 pr-10 text-zinc-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpsPassword(!showOpsPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                    title={showOpsPassword ? "Hide password" : "Show password"}
                  >
                    {showOpsPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 bg-zinc-950/50 rounded-xl border border-zinc-800">
                <input
                  type="checkbox"
                  id="confirm_ops_reset"
                  checked={confirmOpsReset}
                  onChange={(e) => setConfirmOpsReset(e.target.checked)}
                  className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  required
                />
                <label htmlFor="confirm_ops_reset" className="text-[11px] text-zinc-300 cursor-pointer select-none leading-relaxed">
                  I confirm reset of Operations Manager password.
                </label>
              </div>

              <button
                type="submit"
                disabled={opsLoading || !confirmOpsReset}
                className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider font-mono rounded-xl transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{opsLoading ? 'Resetting...' : 'Reset Operations Password'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* 3. PRODUCTION DASHBOARD */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">
                    Production Manager
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono">Dashboard Account</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 text-[10px] font-mono font-bold border border-purple-500/20">
                Production Login
              </span>
            </div>

            {prodSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-start gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{prodSuccess}</span>
              </div>
            )}

            <form onSubmit={handleProdReset} className="space-y-4 pt-2">
              {productionDashboardAccount && (
                <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs space-y-1">
                  <div className="text-[10px] text-zinc-400 uppercase font-mono">Target Account:</div>
                  <div className="font-bold text-white">{productionDashboardAccount.name}</div>
                  <div className="text-zinc-400 font-mono text-[11px]">{productionDashboardAccount.email}</div>
                  <div className="text-purple-400 font-mono text-[10px]">Role: {productionDashboardAccount.role}</div>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="prod_current_password" className="text-[11px] font-mono uppercase tracking-wider text-zinc-300 font-bold block">
                  Current Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="prod_current_password"
                    name="current_password"
                    aria-label="Current Password"
                    type={showProdPassword ? "text" : "password"}
                    value={prodPassword}
                    onChange={(e) => {
                      setHasProdUserEdited(true);
                      setProdPassword(e.target.value);
                    }}
                    placeholder="Current Password"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-3.5 pr-10 text-zinc-100 font-mono text-xs focus:outline-none focus:border-purple-500"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowProdPassword(!showProdPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white cursor-pointer"
                    title={showProdPassword ? "Hide password" : "Show password"}
                  >
                    {showProdPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 bg-zinc-950/50 rounded-xl border border-zinc-800">
                <input
                  type="checkbox"
                  id="confirm_prod_reset"
                  checked={confirmProdReset}
                  onChange={(e) => setConfirmProdReset(e.target.checked)}
                  className="mt-0.5 rounded bg-zinc-900 border-zinc-700 text-purple-500 focus:ring-purple-500 cursor-pointer"
                  required
                />
                <label htmlFor="confirm_prod_reset" className="text-[11px] text-zinc-300 cursor-pointer select-none leading-relaxed">
                  I confirm reset of Production Manager password.
                </label>
              </div>

              <button
                type="submit"
                disabled={prodLoading || !confirmProdReset}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-wider font-mono rounded-xl transition-all cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>{prodLoading ? 'Resetting...' : 'Reset Production Password'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
