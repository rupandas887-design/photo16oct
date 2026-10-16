import React, { useState } from 'react';
import { GitBranch, GitPullRequest, CheckCircle2, AlertCircle, Loader2, X, Github, ExternalLink } from 'lucide-react';

interface GitHubPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitHubPublishModal: React.FC<GitHubPublishModalProps> = ({ isOpen, onClose }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [commitMessage, setCommitMessage] = useState('Update application from AI Studio');
  const [branch, setBranch] = useState('main');
  const [force, setForce] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; details?: string } | null>(null);

  if (!isOpen) return null;

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) {
      setResult({ success: false, message: 'Please enter a valid GitHub repository URL.' });
      return;
    }
    if (!token.trim()) {
      setResult({ success: false, message: 'Please enter your GitHub Personal Access Token (PAT).' });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/github/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          token: token.trim(),
          commitMessage: commitMessage.trim() || 'Update from AI Studio',
          branch: branch.trim() || 'main',
          force: force
        })
      });
      const data = await res.json();
      if (data.success) {
        setResult({
          success: true,
          message: 'Successfully pushed code to GitHub!',
          details: data.output || 'Your repository has been updated successfully.'
        });
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to push code to GitHub.',
          details: data.details || data.stderr
        });
      }
    } catch (err: any) {
      setResult({
        success: false,
        message: 'Network error or server exception while pushing to GitHub.',
        details: err?.message || String(err)
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Publish Code to GitHub</h2>
              <p className="text-xs text-zinc-400">Push your latest code repository updates to GitHub</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handlePublish} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
              GitHub Repository URL <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="https://github.com/username/repository.git"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
              required
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Example: https://github.com/rupandas887/photocrew-erp.git
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-zinc-300">
                Personal Access Token (PAT) <span className="text-red-400">*</span>
              </label>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=PhotoCrew%20ERP"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 hover:underline"
              >
                <span>Generate Token</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition-colors"
              required
            />
            <p className="text-[11px] text-zinc-500 mt-1">
              Requires a Classic PAT with <code className="text-amber-400 font-mono">repo</code> scope checked.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Commit Message</label>
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="force_push_toggle"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-amber-500 focus:ring-amber-500/20 cursor-pointer"
            />
            <label htmlFor="force_push_toggle" className="text-xs text-zinc-400 cursor-pointer select-none">
              Force push (overwrite remote branch if remote repository already has commits)
            </label>
          </div>

          {result && (
            <div className={`p-4 rounded-xl border text-xs space-y-1 ${result.success ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-300'}`}>
              <div className="flex items-center gap-2 font-semibold">
                {result.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
                <span>{result.message}</span>
              </div>
              {result.details && (
                <pre className="mt-1 p-2 bg-black/40 rounded text-[10px] text-zinc-300 overflow-x-auto whitespace-pre-wrap font-mono">
                  {result.details}
                </pre>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-amber-400/10"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Pushing to GitHub...</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-4 h-4" />
                  <span>Push to GitHub</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
