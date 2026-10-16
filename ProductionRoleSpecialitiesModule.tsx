import React, { useState } from 'react';
import { useRole } from './RoleContext';
import { Plus, Edit2, Check, X, ShieldAlert, Sparkles, UserPlus, Users, Trash2, Ban, Sliders } from 'lucide-react';
import { motion } from 'motion/react';
import { formatDateDDMMYY } from '../utils';

export const ProductionRoleSpecialitiesModule: React.FC = () => {
  const { 
    specialities = [], 
    addSpeciality, 
    updateSpeciality, 
    deactivateSpeciality, 
    deleteSpeciality,
    staff = [] 
  } = useRole();

  const [newSpecName, setNewSpecName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Statistics
  const totalCount = specialities.length;
  const activeCount = specialities.filter(s => s.active).length;
  const disabledCount = specialities.filter(s => !s.active).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSpecName.trim()) return;
    
    // Check duplicates
    if (specialities.some(s => s.name.toLowerCase() === newSpecName.trim().toLowerCase())) {
      alert('This speciality already exists.');
      return;
    }

    try {
      await addSpeciality(newSpecName.trim());
      setNewSpecName('');
      setIsAdding(false);
    } catch (err: any) {
      console.warn("Failed saving speciality", err?.message || err);
      alert('Failed to save speciality.');
    }
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;
    try {
      await updateSpeciality(id, editingName.trim());
      setEditingId(null);
      setEditingName('');
    } catch (err: any) {
      console.warn("Failed updating", err?.message || err);
      alert('Failed to update speciality.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete "${name}"? Staff members assigned to this speciality may lose their primary mapping.`)) {
      try {
        await deleteSpeciality(id);
      } catch (err: any) {
        console.warn("Failed deleting", err?.message || err);
        alert('Failed to delete speciality.');
      }
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await deactivateSpeciality(id, !currentActive);
    } catch (err: any) {
      console.warn("Failed toggling", err?.message || err);
      alert('Failed to toggle status.');
    }
  };

  // Get active staff count mapped to this specialty
  const getMappedStaffCount = (specName: string) => {
    return staff.filter(s => s.production_role_speciality === specName).length;
  };

  return (
    <div className="space-y-6 animate-fade-in text-zinc-150">
      
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-zinc-950 border border-zinc-900 rounded-2xl p-6 shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="bg-amber-500/10 text-amber-500 p-2 rounded-lg">
                <Sliders className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-black uppercase tracking-wider text-white font-mono">
                Production Role Specialities
              </h1>
            </div>
            <p className="text-xs text-zinc-400 font-mono">
              CONFIGURE AND DEFINE CUSTOM SPECIALIST COMPETENCIES FOR TEAM ALIGNMENTS
            </p>
          </div>
          
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-[11px] tracking-wider font-mono px-4 py-2.5 rounded-xl cursor-pointer shadow-lg hover:shadow-amber-500/20 duration-200"
          >
            <Plus className="w-4 h-4 text-zinc-950 stroke-[3]" />
            <span>Add Speciality</span>
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Total Skillsets</div>
            <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
          </div>
          <div className="text-zinc-500 text-xs">Roles Configuration</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Active Skillsets</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{activeCount}</div>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Disabled Skillsets</div>
            <div className="text-2xl font-black text-zinc-500 mt-1">{disabledCount}</div>
          </div>
          <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        </div>
      </div>

      {/* Inline Adding form option */}
      {isAdding && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-950 border border-zinc-900 p-5 rounded-2xl"
        >
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h3 className="text-xs font-black uppercase text-amber-500 tracking-wider font-mono flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Initialize New Competency Speciality
              </h3>
              <button 
                type="button" 
                onClick={() => setIsAdding(false)}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer text-xs"
              >
                ✕ Close
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold block">
                  Competency Speciality Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Luxury Album Designer, Wedding Editor, Instagram Reels Editor..."
                  value={newSpecName}
                  onChange={(e) => setNewSpecName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                  required
                />
              </div>
              
              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black uppercase text-xs tracking-wider font-mono py-3 rounded-xl duration-200 cursor-pointer text-center flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4 text-zinc-950" />
                <span>Save New Competency</span>
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Speciality Directory Cards / Table */}
      <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-900 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest font-mono text-zinc-350 flex items-center gap-2">
            <span>⚙️</span> Registered Production Competencies List
          </h2>
          <span className="text-[10px] bg-zinc-900 border border-zinc-850 px-2.5 py-1 text-zinc-500 font-mono rounded">
            DB STABLE SYNCHRONIZED
          </span>
        </div>

        <div className="divide-y divide-zinc-900">
          {specialities.map((spec) => {
            const mappedStaffCount = getMappedStaffCount(spec.name);
            const isEditing = editingId === spec.speciality_id;
            
            return (
              <div 
                key={spec.speciality_id} 
                className={`p-4.5 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  !spec.active ? 'bg-zinc-950/40 opacity-70' : 'hover:bg-zinc-900/10'
                }`}
              >
                {/* Left Area - Detail / Input */}
                <div className="flex-1">
                  {isEditing ? (
                    <div className="flex items-center gap-2 max-w-md">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono w-full"
                      />
                      <button
                        onClick={() => handleSaveEdit(spec.speciality_id)}
                        className="p-1.5 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-zinc-950 rounded-lg cursor-pointer transition-colors"
                        title="Save Changes"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
                        title="Cancel Edition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-white font-mono">{spec.name}</span>
                        {!spec.active && (
                          <span className="text-[9px] bg-rose-500/10 border border-rose-500/15 text-rose-400 rounded px-1.5 py-0.5 uppercase tracking-wider font-mono">
                            Disabled
                          </span>
                        )}
                        {spec.active && (
                          <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 rounded px-1.5 py-0.5 uppercase tracking-wider font-mono">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-550 font-mono mt-1 flex items-center gap-3">
                        <span>ID: <strong className="text-zinc-400">{spec.speciality_id}</strong></span>
                        <span>•</span>
                        <span>Created: <strong>{spec.created_at ? formatDateDDMMYY(spec.created_at) : 'System Default'}</strong></span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Center Area - Mapped Staff Count */}
                <div className="flex items-center gap-3 font-mono">
                  <div className="bg-zinc-900/60 border border-zinc-850 px-3 py-1.5 rounded-lg text-center min-w-max">
                    <div className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Mapped Staff</div>
                    <div className="text-xs font-black text-zinc-100 flex items-center justify-center gap-1 mt-0.5">
                      <Users className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{mappedStaffCount} Active</span>
                    </div>
                  </div>
                </div>

                {/* Right Area - Action Commands */}
                <div className="flex items-center gap-2 font-mono">
                  {/* Enable/Disable Toggle button */}
                  <button
                    onClick={() => handleToggleActive(spec.speciality_id, spec.active)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg transition-all cursor-pointer border ${
                      spec.active
                        ? 'bg-amber-500/10 hover:bg-amber-500/15 text-amber-400 border-amber-500/15'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-500/15'
                    }`}
                    title={spec.active ? 'Disable Competency' : 'Enable Competency'}
                  >
                    <Ban className="w-3 h-3" />
                    <span>{spec.active ? 'Disable' : 'Enable'}</span>
                  </button>

                  {/* Edit Button */}
                  {!isEditing && (
                    <button
                      onClick={() => handleStartEdit(spec.speciality_id, spec.name)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] bg-zinc-800 hover:bg-zinc-750 text-zinc-300 border border-zinc-705 rounded-lg transition-all cursor-pointer"
                      title="Edit Speciality Name"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                  )}

                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(spec.speciality_id, spec.name)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] bg-rose-500/15 hover:bg-rose-500/20 text-rose-450 border border-rose-500/10 rounded-lg transition-all cursor-pointer"
                    title="Delete Competency from Database"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}

          {specialities.length === 0 && (
            <div className="text-center py-10 font-mono text-zinc-500 uppercase text-xs">
              ⚠️ No production role specialities registered inside the system.
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
};
